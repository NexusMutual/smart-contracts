// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IAssessment.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "./AssessmentUtilsLib.sol";

library AssessmentVoteLib {

  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint16 internal constant PERC_BASIS_POINTS = 10000;

  function _getTotalRewardForEvent (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.EventType eventType,
    uint104 id,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) internal view returns (uint) {
    if (eventType == IAssessment.EventType.CLAIM) {
      IAssessment.ClaimDetails memory claimDetails = claims[id].details;
      return claimDetails.amount * CONFIG.REWARD_PERC * claimDetails.coverPeriod / 365 / PERC_BASIS_POINTS;
    }
    IAssessment.IncidentDetails memory incidentDetails = incidents[id].details;
    uint payoutImpact = AssessmentUtilsLib._getPayoutImpactOfIncident(incidentDetails);
    return payoutImpact * CONFIG.REWARD_PERC / PERC_BASIS_POINTS;
  }

  // [todo] Expose a view to find out the last index until withdrawals can be made and also
  //  views for total rewards and withdrawable rewards
  function withdrawReward (
    IAssessment.Configuration calldata CONFIG,
    INXMToken nxm,
    address user,
    uint104 untilIndex,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) external returns (uint rewardToWithdraw, uint104 withdrawUntilIndex) {
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
    for (uint i = stake.rewardsWithdrawnUntilIndex; i < withdrawUntilIndex; i++) {
      IAssessment.Vote memory vote = votesOf[user][i];
      require(
        block.timestamp > AssessmentUtilsLib._getVoteLockupEndDate(CONFIG, vote),
        "Cannot withdraw rewards from votes which are in lockup period"
      );
      IAssessment.Poll memory poll =
        IAssessment.EventType(vote.eventType) == IAssessment.EventType.CLAIM
        ? claims[vote.eventId].poll
        : incidents[vote.eventId].poll;

      totalReward = _getTotalRewardForEvent(
        CONFIG,
        IAssessment.EventType(vote.eventType),
        vote.eventId,
        claims,
        incidents
      );
      rewardToWithdraw += totalReward * vote.tokenWeight / (poll.accepted + poll.denied);
    }

    stakeOf[user].rewardsWithdrawnUntilIndex = withdrawUntilIndex;
    nxm.mint(user, rewardToWithdraw);
  }

  function castVote (
    IAssessment.Configuration calldata CONFIG,
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

    uint payoutImpact;
    IAssessment.Poll memory poll;
    uint32 blockTimestamp = uint32(block.timestamp);
    if (IAssessment.EventType(eventType) == IAssessment.EventType.CLAIM) {
      IAssessment.Claim memory claim = claims[id];
      poll = claims[id].poll;
      payoutImpact = AssessmentUtilsLib._getPayoutImpactOfClaim(claim.details);
      require(blockTimestamp < poll.end, "Voting is closed");
    } else {
      IAssessment.Incident memory incident = incidents[id];
      poll = incidents[id].poll;
      payoutImpact = AssessmentUtilsLib._getPayoutImpactOfIncident(incident.details);
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

    poll.end = AssessmentUtilsLib._calculatePollEndDate(CONFIG, poll, payoutImpact);

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
    IAssessment.Configuration calldata CONFIG,
    INXMToken nxm,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    uint96 amount
  ) external {
    IAssessment.Stake storage stake = stakeOf[msg.sender];
    require(stake.amount != 0, "No tokens staked");
    uint voteCount = votesOf[msg.sender].length;
    require(
      block.timestamp > AssessmentUtilsLib._getVoteLockupEndDate(CONFIG, votesOf[msg.sender][voteCount - 1]),
      "Cannot withdraw stake while in lockup period"
     );

    nxm.transferFrom(address(this), msg.sender, amount);
    stake.amount -= amount;
  }
}
