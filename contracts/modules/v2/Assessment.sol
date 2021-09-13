// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IAssessment.sol";
import "../../abstract/MasterAwareV2.sol";

import "@openzeppelin/contracts-v4/utils/cryptography/MerkleProof.sol";

/// Provides a way for cover owners to submit claims and redeem the payouts and facilitates
/// assessment processes where members decide the outcome of the events that lead to potential
/// payouts.
contract Assessment is IAssessment, MasterAwareV2 {

  INXMToken internal immutable nxm;

  /* ========== STATE VARIABLES ========== */

  Configuration public override config;

  // Stake states of users. (See Stake struct)
  mapping(address => Stake) public override stakeOf;

  // Votes of users. (See Vote struct)
  mapping(address => Vote[]) public override votesOf;

  // Mapping used to determine if a user has already voted, using a vote hash as a key
  mapping(address => mapping(uint => bool)) public override hasAlreadyVotedOn;

  // An array of merkle tree roots used to indicate fraudulent assessors. Each root represents a
  // fraud attempt by one or multiple addresses. Once the root is submitted by adivsory board
  // members through governance, burnFraud uses this root to burn the fraudulent assessors' stakes
  // and correct the outcome of the poll.
  bytes32[] internal fraudResolution;

  Assessment[] public override assessments;

  /* ========== CONSTRUCTOR ========== */

  constructor(address nxmAddress) {
    nxm = INXMToken(nxmAddress);
  }

  function initialize (address masterAddress) external {
    config.minVotingPeriodDays = 3; // days
    config.payoutCooldownDays = 1; //days
    master = INXMMaster(masterAddress);
  }


  /* ========== VIEWS ========== */

  function min(uint a, uint b) internal pure returns (uint) {
    return a <= b ? a : b;
  }

  function getVoteCountOfAssessor(address assessor) external override view returns (uint) {
    return votesOf[assessor].length;
  }

  function getAssessmentsCount() external override view returns (uint) {
    return assessments.length;
  }

  function getRewards(address user) external view returns (
    uint total,
    uint withdrawable,
    uint withdrawableUntilIndex
  ) {
    uint104 rewardsWithdrawnUntilIndex = stakeOf[user].rewardsWithdrawnUntilIndex;
    Vote memory vote;
    Assessment memory assessment;
    uint voteCount = votesOf[user].length;
    for (uint i = rewardsWithdrawnUntilIndex; i < voteCount; i++) {
      vote = votesOf[user][i];
      assessment = assessments[vote.assessmentId];

      // If withdrawableUntilIndex has been assigned before, continue calculating the total accrued
      // rewards.
      if (
        withdrawableUntilIndex == 0 &&
        assessment.poll.end + config.payoutCooldownDays * 1 days >= block.timestamp
      ) {
        // If withdrawableUntilIndex has not been assigned before and the poll is not in a final
        // state, store the index of the vote until which rewards can be withdrawn.
        withdrawableUntilIndex = i;
        // Then, also store the total value that can be withdrawn until this index.
        withdrawable = total;
      }

      total += assessment.totalReward * vote.stakedAmount /
        (assessment.poll.accepted + assessment.poll.denied);
    }
  }


  /* === MUTATIVE FUNCTIONS ==== */

  function stake(uint96 amount) external override {
    stakeOf[msg.sender].amount += amount;
    ITokenController(getInternalContractAddress(ID.TC))
      .operatorTransfer(msg.sender, address(this), amount);
  }

  function unstake(uint96 amount) external override {
    uint voteCount = votesOf[msg.sender].length;
    Vote memory vote = votesOf[msg.sender][voteCount - 1];
    require(
      block.timestamp > vote.timestamp + config.stakeLockupPeriodDays * 1 days,
      "Stake is in lockup period"
     );

    nxm.transferFrom(address(this), msg.sender, amount);
    stakeOf[msg.sender].amount -= amount;
  }

  /// Withdraws a staker's accumulated rewards
  /// @dev
  ///
  /// @param user        The address of the staker for which the rewards are withdrawn
  /// @param untilIndex  The index until which the rewards should be withdrawn. Used if a large
  ///                    number of assessments accumulates and the function doesn't fir in one
  ///                    block, thus requiring multiple batched transactions.
  function withdrawRewards(address user, uint104 untilIndex) external override
  returns (uint withdrawn, uint withdrawUntilIndex) {
    uint104 rewardsWithdrawnUntilIndex = stakeOf[user].rewardsWithdrawnUntilIndex;
    {
      uint voteCount = votesOf[user].length;
      withdrawUntilIndex = untilIndex > 0 ? untilIndex : voteCount;
      require(
        untilIndex <= voteCount,
        "Vote count is smaller that the provided untilIndex"
      );
      require(rewardsWithdrawnUntilIndex < voteCount, "No withdrawable rewards");
    }

    Vote memory vote;
    Assessment memory assessment;
    for (uint i = rewardsWithdrawnUntilIndex; i < withdrawUntilIndex; i++) {
      vote = votesOf[user][i];
      assessment = assessments[vote.assessmentId];
      if (assessment.poll.end + config.payoutCooldownDays * 1 days >= block.timestamp) {
        // Poll is not final
        withdrawUntilIndex = i;
        break;
      }

      withdrawn += assessment.totalReward * vote.stakedAmount /
        (assessment.poll.accepted + assessment.poll.denied);
    }

    // This is the index where the next withdrawReward call will start iterating from
    stakeOf[user].rewardsWithdrawnUntilIndex = uint104(withdrawUntilIndex);
    ITokenController(getInternalContractAddress(ID.TC)).mint(user, withdrawn);
  }


  function startAssessment(uint totalAssessmentReward, uint assessmentDeposit) external
  override onlyInternal returns (uint) {
    assessments.push(Assessment(
      Poll(
        0, // accepted
        0, // denied
        uint32(block.timestamp), // start
        uint32(block.timestamp + config.minVotingPeriodDays * 1 days) // end
      ),
      uint128(totalAssessmentReward),
      uint128(assessmentDeposit)
    ));
    return assessments.length - 1;
  }

  function castVote(uint assessmentId, bool isAccepted) external override {
    {
      require(!hasAlreadyVotedOn[msg.sender][assessmentId], "Already voted");
      hasAlreadyVotedOn[msg.sender][assessmentId] = true;
    }

    uint96 stakeAmount = stakeOf[msg.sender].amount;
    require(stakeAmount > 0, "A stake is required to cast votes");

    Poll memory poll = assessments[assessmentId].poll;
    require(block.timestamp < poll.end, "Voting is closed");
    require(
      poll.accepted > 0 || isAccepted,
      "At least one accept vote is required to vote deny"
    );

    if (isAccepted && poll.accepted == 0) {
      // Reset the poll end when the first accepted vote
      poll.end = uint32(block.timestamp + config.minVotingPeriodDays * 1 days);
    }

    // Check if poll ends in less than 24 hours
    if (poll.end - block.timestamp < 1 days) {
      // Extend proportionally to the user's stake but up to 1 day maximum
      poll.end += uint32(min(1 days, 1 days * stakeAmount / (poll.accepted + poll.denied)));
    }

    if (isAccepted) {
      poll.accepted += stakeAmount;
    } else {
      poll.denied += stakeAmount;
    }

    assessments[assessmentId].poll = poll;

    votesOf[msg.sender].push(Vote(
      uint80(assessmentId),
      isAccepted,
      uint32(block.timestamp),
      stakeAmount
    ));
  }

  function submitFraud(bytes32 root) external override onlyGovernance {
    fraudResolution.push(root);
  }

  function processFraud(
    uint256 rootIndex,
    bytes32[] calldata proof,
    address assessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize
  ) external override {
    require(
      MerkleProof.verify(
        proof,
        fraudResolution[rootIndex],
        keccak256(abi.encodePacked(assessor, lastFraudulentVoteIndex, burnAmount, fraudCount))
      ),
      "Invalid merkle proof"
    );

    Stake memory _stake = stakeOf[assessor];

    // Make sure we don't burn beyond lastFraudulentVoteIndex
    uint processUntil = _stake.rewardsWithdrawnUntilIndex + voteBatchSize;
    if (processUntil >= lastFraudulentVoteIndex) {
      processUntil = lastFraudulentVoteIndex + 1;
    }

    for (uint j = _stake.rewardsWithdrawnUntilIndex; j < processUntil; j++) {
      IAssessment.Vote memory vote = votesOf[assessor][j];
      IAssessment.Poll memory poll = assessments[vote.assessmentId].poll;

      {
        if (uint32(block.timestamp) >= poll.end + config.payoutCooldownDays * 1 days) {
          // Once the cooldown period ends the poll result is final, thus skip
          continue;
        }
      }


      if (vote.accepted) {
        poll.accepted -= vote.stakedAmount;
      } else {
        poll.denied -= vote.stakedAmount;
      }

      // If the poll ends in less than 24h, extend it to 24h
      if (poll.end < uint32(block.timestamp) + 1 days) {
        poll.end = uint32(block.timestamp) + 1 days;
      }

      emit FraudResolution(vote.assessmentId, assessor, poll);
      assessments[vote.assessmentId].poll = poll;
    }

    // Burns an assessor only once for each merkle tree root, no matter how many times this function
    // runs on the same account. When a transaction is too big to fit in one block, it is batched
    // in multiple transactions according to voteBatchSize. After burning the tokens, fraudCount
    // is incremented. If another merkle root is submitted that contains the same addres, the leaf
    // should use the updated fraudCount stored in the Stake struct as input.
    if (fraudCount == _stake.fraudCount) {
      // Make sure this doesn't revert if the stake amount is already subtracted due to a previous
      // burn from a different merkle tree.
      burnAmount = burnAmount > _stake.amount ? _stake.amount : burnAmount;
      _stake.amount -= burnAmount;
      nxm.burn(burnAmount);
      _stake.fraudCount++;
    }

    _stake.rewardsWithdrawnUntilIndex = uint104(processUntil);
    stakeOf[assessor] = _stake;

  }

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values)
  external override onlyGovernance {
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == IAssessment.UintParams.minVotingPeriodDays) {
        newConfig.minVotingPeriodDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.stakeLockupPeriodDays) {
        newConfig.stakeLockupPeriodDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.payoutCooldownDays) {
        newConfig.payoutCooldownDays = uint8(values[i]);
        continue;
      }
    }
    config = newConfig;
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
  }

}
