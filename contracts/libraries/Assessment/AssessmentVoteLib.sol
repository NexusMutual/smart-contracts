// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IAssessment.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../libraries/Assessment/AssessmentClaimsLib.sol";
import "../../libraries/Assessment/AssessmentIncidentsLib.sol";

library AssessmentVoteLib {

  // Ratios are defined between 0-10000 bps (i.e. double decimal precision percentage)
  uint internal constant RATIO_BPS = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  function abs(int x) internal pure returns (int) {
    return x >= 0 ? x : -x;
  }

  function min(uint a, uint b) internal pure returns (uint) {
    return a <= b ? a : b;
  }

  function _getPollStatus(IAssessment.Poll memory poll)
  internal view returns (IAssessment.PollStatus) {
    if (block.timestamp < poll.end) {
      return IAssessment.PollStatus.PENDING;
    }
    if (poll.accepted > poll.denied) {
      return IAssessment.PollStatus.ACCEPTED;
    }
    return IAssessment.PollStatus.DENIED;
  }

  function _getTotalRewardForEvent (
    IAssessment.Configuration calldata config,
    IAssessment.EventType eventType,
    uint104 id,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) internal view returns (uint) {
    if (eventType == IAssessment.EventType.CLAIM) {
      IAssessment.ClaimDetails memory details = claims[id].details;
      uint expectedPayoutNXM = AssessmentClaimsLib._getExpectedClaimPayoutNXM(details);
      return expectedPayoutNXM * config.rewardRatio * details.coverPeriod / 365
      / RATIO_BPS;
    }
    if (eventType == IAssessment.EventType.CLAIM) {
      IAssessment.IncidentDetails memory details = incidents[id].details;
      uint expectedPayoutNXM = AssessmentIncidentsLib._getExpectedIncidentPayoutNXM(details);
      return expectedPayoutNXM * config.rewardRatio / RATIO_BPS;
    }
    revert("Unsupported eventType");
  }

  /**
   *  Calculates when a poll ends
   *
   *  @dev The end date timestamp is dynamically determined by the expected payout amount, how
   *  strong the consensus is and the amount of tokens used for voting.
   *
   *  @param config             Configuration of the calling contract.
   *  @param poll               Poll for which the end date is calculated.
   *  @param expectedPayoutNXM  Amount of NXM that is expected to be paid out if the result of the
   *                            turns out as accepted. It is required to calculate the
   *                            paritcipation driven extension ratio.
   */
  function _calculatePollEndDate (
    IAssessment.Configuration calldata config,
    IAssessment.Poll memory poll,
    uint expectedPayoutNXM
  ) internal pure returns (uint32) {
    /* Revert if the poll has no votes. This view only makes sense if there is at least one accept
     * vote.
     */
    require(poll.accepted > 0 || poll.denied > 0);

    /* The formula returns 0 when the ratio between accepted and denied is 1:1. It linearly
     * increases to 1 as it approaches either 100% accepted or 100% denied.
     */
    uint consensus = uint(
      abs(int(2 * poll.accepted * PRECISION / (poll.accepted + poll.denied)) - int(PRECISION))
    );

    /*  The formula returns 1 when 10 x expectedPayoutNXM tokens are used for voting
     *  (accepted + denied, meaning high participation) and it linearly decreases to 0 as the
     *  amount of tokens approaches 0 (meaning low participation). The amount is capped at 10x
     *  expectedPayoutNXM, meaning that if more tokens are used the maximm value is still 1.
     *  This is done by taking the minimum between the maximum cap and the ratio between voting NXM
     *  and expected payout in NXM.
     */
    uint participation = min(
      (poll.accepted + poll.denied) * PRECISION / expectedPayoutNXM,
      10 * PRECISION
    ) / 10;

    /*  The extension ratio is 1 when consensus and participation are 0. It decreases as both
     *  consensus and participation increase. The minimum of the two is subtracted such as a poll
     *  that only has strong consensus but low participation will still return a ratio of 1 and
     *  vice-versa.
     */
    uint extensionRatio = (1 * PRECISION - min(consensus,  participation));

    /* Duration has a lower bound of minVotingPeriodDays and an upper bound of maxVotingPeriodDays.
     * The extensionRatio [0,1] determines by how much the duration is extended towards
     * maxVotingPeriodDays.
     */
    uint duration = config.minVotingPeriodDays * 1 days + extensionRatio *
      (config.maxVotingPeriodDays  - config.minVotingPeriodDays ) * 1 days / PRECISION;

    // Finally add the duration to the start date of the poll
    return uint32(poll.start + duration);
  }

  /**
   *  Calculates when the lockup period ends for a given vote of a staker
   *
   *  @dev The returned value is calculated as the sum between the vote date and the maximum period
   *  a poll is not considered final. A poll that is still pending or that can be subject to fraud
   *  resolution is not considered final.
   *
   *  @param config  Assessment configuration variables.
   *  @param vote    The vote of a staker for which the lockup period is calculated.
   */
  function _getVoteLockupEndDate (
    IAssessment.Configuration calldata config,
    IAssessment.Vote memory vote
   ) internal pure returns (uint) {
    return vote.timestamp + config.maxVotingPeriodDays + config.payoutCooldownDays;
  }

  // [todo] Expose a view to find out the last index until withdrawals can be made and also
  //  views for total rewards and withdrawable rewards
  function withdrawReward (
    IAssessment.Configuration calldata config,
    INXMToken nxm,
    address user,
    uint104 untilIndex,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) external returns (uint withdrawn, uint104 withdrawUntilIndex) {
    IAssessment.Stake memory stake = stakeOf[user];
    {
      uint voteCount = votesOf[user].length;
      withdrawUntilIndex = untilIndex > 0 ? untilIndex : uint104(voteCount);
      require(
        untilIndex <= voteCount,
        "Vote count is smaller that the provided untilIndex"
      );
      require(stake.rewardsWithdrawnUntilIndex < voteCount, "No withdrawable rewards");
    }

    uint totalReward;
    IAssessment.Vote memory vote;
    IAssessment.Poll memory poll;
    for (uint i = stake.rewardsWithdrawnUntilIndex; i < withdrawUntilIndex; i++) {
      vote = votesOf[user][i];
      poll = assessments[vote.pollId];
      if (poll.end + config.payoutCooldownDays * 1 days >= blockTimestamp) {
        // Poll is not final
        break;
      }

      // [todo] Replace with storage read
      totalReward = _getTotalRewardForEvent(
        config,
        IAssessment.EventType(vote.eventType),
        vote.eventId,
        claims,
        incidents
      );

      withdrawn += totalReward * vote.tokenWeight / (poll.accepted + poll.denied);
    }

    // [todo] withdrawUntilIndex should be replaced with the last processed index from the loop above
    stakeOf[user].rewardsWithdrawnUntilIndex = withdrawUntilIndex;
    // [todo] Replace with TC
    nxm.mint(user, withdrawn);
  }

  function castVote (
    IAssessment.Configuration calldata config,
    uint8 eventType,
    uint104 id,
    bool accepted,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    mapping(bytes32 => bool) storage hasAlreadyVotedOn,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) external {

    {
      bytes32 voteHash = keccak256(abi.encodePacked(id, msg.sender, eventType));
      require(!hasAlreadyVotedOn[voteHash], "Already voted");
      hasAlreadyVotedOn[voteHash] = true;
    }

    IAssessment.Stake memory stake = stakeOf[msg.sender];
    require(stake.amount > 0, "A stake is required to cast votes");

    uint expectedPayoutNXM;
    IAssessment.Poll memory poll;
    uint32 blockTimestamp = uint32(block.timestamp);
    if (IAssessment.EventType(eventType) == IAssessment.EventType.CLAIM) {
      IAssessment.Claim memory claim = claims[id];
      poll = claims[id].poll;
      expectedPayoutNXM = AssessmentClaimsLib._getExpectedClaimPayoutNXM(claim.details);
      require(blockTimestamp < poll.end, "Voting is closed");
    } else {
      IAssessment.Incident memory incident = incidents[id];
      poll = incidents[id].poll;
      expectedPayoutNXM = AssessmentIncidentsLib._getExpectedIncidentPayoutNXM(incident.details);
      require(blockTimestamp < poll.end, "Voting is closed");
    }

    require(
      poll.accepted > 0 || accepted == true,
      "At least one accept vote is required to vote deny"
    );

    if (accepted) {
      if (poll.accepted == 0) {
        poll.start = blockTimestamp;
      }
      poll.accepted += stake.amount;
    } else {
      poll.denied += stake.amount;
    }

    poll.end = _calculatePollEndDate(config, poll, expectedPayoutNXM);

    if (poll.end < blockTimestamp) {
      // When poll end date falls in the past, replace it with the current block timestamp
      poll.end = blockTimestamp;
    }

    // [todo] Add condition when vote shifts poll end in the past and write end with the
    // current blcok timestamp. Could also consider logic where the consensus is shifted at the
    // very end of the voting period.

    if (IAssessment.EventType(eventType) == IAssessment.EventType.CLAIM) {
      claims[id].poll = poll;
    } else {
      incidents[id].poll = poll;
    }

    votesOf[msg.sender].push(IAssessment.Vote(
      id,
      accepted,
      blockTimestamp,
      stake.amount,
      eventType
    ));
  }

  function withdrawStake (
    IAssessment.Configuration calldata config,
    INXMToken nxm,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    uint96 amount
  ) external {
    IAssessment.Stake storage stake = stakeOf[msg.sender];
    require(stake.amount != 0, "No tokens staked");
    uint voteCount = votesOf[msg.sender].length;
    IAssessment.Vote vote = votesOf[msg.sender][voteCount - 1];
    // [todo] Add stake lockup period from config
    require(
      block.timestamp > vote.timestamp +
      config.maxVotingPeriodDays + config.payoutCooldownDays,
      "Cannot withdraw stake while in lockup period"
     );

    nxm.transferFrom(address(this), msg.sender, amount);
    stake.amount -= amount;
  }
}
