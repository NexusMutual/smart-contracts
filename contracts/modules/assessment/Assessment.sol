// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/utils/cryptography/MerkleProof.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

/// Provides the assessment mechanism for members to decide the outcome of the events that can lead
/// to payouts. Mints rewards for stakers that act benevolently and allows burning fraudulent ones.
contract Assessment is IAssessment, MasterAwareV2 {

  INXMToken internal immutable nxm;

  /* ========== STATE VARIABLES ========== */

  // Parameters configurable through governance.
  Configuration public override config;

  // Stake states of users. (See Stake struct)
  mapping(address => Stake) public override stakeOf;

  // Votes of users. (See Vote struct)
  mapping(address => Vote[]) public override votesOf;

  // Mapping used to determine if a user has already voted
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

  function initialize () external {
    Configuration memory currentConfig = config;
    bool notInitialized = bytes32(
      abi.encodePacked(
        currentConfig.minVotingPeriodInDays,
        currentConfig.payoutCooldownInDays,
        currentConfig.stakeLockupPeriodInDays,
        currentConfig.silentEndingPeriodInDays
      )
    ) == bytes32(0);
    require(notInitialized, "Already initialized");

    config.minVotingPeriodInDays = 3; // days
    config.payoutCooldownInDays = 1; // days
    config.stakeLockupPeriodInDays = 14; // days
    config.silentEndingPeriodInDays = 1; // days
  }

  /* ========== VIEWS ========== */

  /// @dev Returns the vote count of an assessor.
  ///
  /// @param assessor  The address of the assessor.
  function getVoteCountOfAssessor(address assessor) external override view returns (uint) {
    return votesOf[assessor].length;
  }

  /// @dev Returns the number of assessments.
  function getAssessmentsCount() external override view returns (uint) {
    return assessments.length;
  }

  /// @dev Returns only the poll from the assessment struct to make only one SLOAD. Is used by
  /// other contracts.
  ///
  /// @param assessmentId  The index of the assessment
  function getPoll(uint assessmentId) external override view returns (Poll memory) {
    return assessments[assessmentId].poll;
  }

  /// Returns all pending rewards, the withdrawable amount and the index until which they can be
  /// withdrawn.
  ///
  /// @param staker  The address of the staker
  function getRewards(address staker) external override view returns (
    uint totalPendingAmountInNXM,
    uint withdrawableAmountInNXM,
    uint withdrawableUntilIndex
  ) {
    uint104 rewardsWithdrawableFromIndex = stakeOf[staker].rewardsWithdrawableFromIndex;
    Vote memory vote;
    Assessment memory assessment;
    uint voteCount = votesOf[staker].length;
    bool hasReachedUnwithdrawableReward = false;

    for (uint i = rewardsWithdrawableFromIndex; i < voteCount; i++) {
      vote = votesOf[staker][i];
      assessment = assessments[vote.assessmentId];

      // If hasReachedUnwithdrawableReward is true, skip and continue calculating the pending total
      // rewards.
      if (
        !hasReachedUnwithdrawableReward &&
        assessment.poll.end + config.payoutCooldownInDays * 1 days >= block.timestamp
      ) {
        hasReachedUnwithdrawableReward = true;
        // Store the index of the vote until which rewards can be withdrawn.
        withdrawableUntilIndex = i;
        // Then, also store the pending total value that can be withdrawn until this index.
        withdrawableAmountInNXM = totalPendingAmountInNXM;
      }

      totalPendingAmountInNXM += uint(assessment.totalRewardInNXM) * uint(vote.stakedAmount) /
        (uint(assessment.poll.accepted) + uint(assessment.poll.denied));
    }

    if (!hasReachedUnwithdrawableReward) {
      withdrawableUntilIndex = voteCount;
      withdrawableAmountInNXM = totalPendingAmountInNXM;
    }
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// Increases the sender's stake by the specified amount and transfers NXM to this contract
  ///
  /// @param amount  The amount of nxm to stake
  function stake(uint96 amount) public whenNotPaused {
    stakeOf[msg.sender].amount += amount;
    ITokenController(getInternalContractAddress(ID.TC))
      .operatorTransfer(msg.sender, address(this), amount);
  }

  /// Withdraws a portion or all of the user's stake
  ///
  /// @dev At least stakeLockupPeriodInDays must have passed since the last vote.
  ///
  /// @param amount  The amount of nxm to unstake
  /// @param to      The member address where the NXM is transfered to. Useful for switching
  ///                membership during stake lockup period and thus allowing the user to withdraw
  ///                their staked amount to the new address when possible.
  function unstake(uint96 amount, address to) external whenNotPaused override {
    uint voteCount = votesOf[msg.sender].length;
    if (voteCount > 0) {
      Vote memory vote = votesOf[msg.sender][voteCount - 1];
      require(
        block.timestamp > vote.timestamp + config.stakeLockupPeriodInDays * 1 days,
        "Stake is in lockup period"
      );
    }

    stakeOf[msg.sender].amount -= amount;
    nxm.transfer(to, amount);
  }

  /// Withdraws a staker's accumulated rewards to a destination address but only the staker can
  /// call this.
  ///
  /// @dev Only withdraws until the last finalized poll.
  ///
  /// @param staker      The address of the staker for which the rewards are withdrawn
  /// @param batchSize   The index until which (but not including) the rewards should be withdrawn.
  ///                    Used if a large number of assessments accumulates and the function doesn't
  ///                    fit in one block, thus requiring multiple batched transactions.
  function withdrawRewards(
    address staker,
    uint104 batchSize
  ) external override whenNotPaused returns (uint withdrawn, uint withdrawnUntilIndex) {
    return _withdrawRewards(staker, staker, batchSize);
  }

  /// Withdraws a staker's accumulated rewards.
  ///
  /// @dev Only withdraws until the last finalized poll.
  ///
  /// @param destination The destination address where the rewards will be withdrawn.
  /// @param batchSize   The index until which (but not including) the rewards should be withdrawn.
  ///                    Used if a large number of assessments accumulates and the function doesn't
  ///                    fit in one block, thus requiring multiple batched transactions.
  function withdrawRewardsTo(
    address destination,
    uint104 batchSize
  ) external override whenNotPaused returns (uint withdrawn, uint withdrawnUntilIndex) {
    return _withdrawRewards(msg.sender, destination, batchSize);
  }

  function _withdrawRewards(
    address staker,
    address destination,
    uint104 batchSize
  ) internal returns (uint withdrawn, uint withdrawnUntilIndex) {
    require(
      IMemberRoles(internalContracts[uint(ID.MR)]).checkRole(
        destination,
        uint(IMemberRoles.Role.Member)
      ),
      "Destination address is not a member"
    );

    // This is the index until which (but not including) the previous withdrawal was processed.
    // The current withdrawal starts from this index.
    uint104 rewardsWithdrawableFromIndex = stakeOf[staker].rewardsWithdrawableFromIndex;
    {
      uint voteCount = votesOf[staker].length;
      require(rewardsWithdrawableFromIndex < voteCount, "No withdrawable rewards");
      // If batchSize is a non-zero value, it means the withdrawal is going to be batched in
      // multiple transactions.
      withdrawnUntilIndex = batchSize > 0 ? rewardsWithdrawableFromIndex + batchSize : voteCount;
    }

    Vote memory vote;
    Assessment memory assessment;
    for (uint i = rewardsWithdrawableFromIndex; i < withdrawnUntilIndex; i++) {
      vote = votesOf[staker][i];
      assessment = assessments[vote.assessmentId];
      if (assessment.poll.end + config.payoutCooldownInDays * 1 days >= block.timestamp) {
        // Poll is not final
        withdrawnUntilIndex = i;
        break;
      }

      withdrawn += uint(assessment.totalRewardInNXM) * uint(vote.stakedAmount) /
        (uint(assessment.poll.accepted) + uint(assessment.poll.denied));
    }

    // This is the index where the next withdrawReward call will start iterating from
    stakeOf[staker].rewardsWithdrawableFromIndex = SafeUintCast.toUint104(withdrawnUntilIndex);
    ITokenController(getInternalContractAddress(ID.TC)).mint(destination, withdrawn);
  }


  /// Creates a new assessment
  ///
  /// @dev Is used only by contracts acting as redemption methods for cover product types.
  ///
  /// @param totalAssessmentReward   The total reward that is shared among the stakers participating
  ///                                the assessment.
  /// @param assessmentDepositInETH  The deposit that covers assessment rewards in case it's denied.
  ///                                If the assessment verdict is positive, the contract that relies
  ///                                on it can send back the deposit at payout.
  function startAssessment(
    uint totalAssessmentReward,
    uint assessmentDepositInETH
  ) external override onlyInternal returns (uint) {
    assessments.push(Assessment(
      Poll(
        0, // accepted
        0, // denied
        uint32(block.timestamp), // start
        uint32(block.timestamp + config.minVotingPeriodInDays * 1 days) // end
      ),
      uint128(totalAssessmentReward),
      uint128(assessmentDepositInETH)
    ));
    return assessments.length - 1;
  }

  /// Casts multiple votes on assessments and optionally allows to increase the stake in the same
  /// transaction.
  ///
  /// @dev See stake and castVote functions.
  ///
  /// @param assessmentIds  Array of assessment indexes for which the votes are cast.
  /// @param votes          Array of votes corresponding to each assessment id from the
  ///                       assessmentIds param. Elements that are false represent a deny vote and
  ///                       those that are true represent an accept vote.
  /// @param stakeIncrease  When a non-zero value is given, this function will also increase the
  ///                       stake in the same transaction.
  function castVotes(
    uint[] calldata assessmentIds,
    bool[] calldata votes,
    uint96 stakeIncrease
  ) external override onlyMember whenNotPaused {
    require(
      assessmentIds.length == votes.length,
      "The lengths of the assessment ids and votes arrays mismatch"
    );

    if (stakeIncrease > 0) {
      stake(stakeIncrease);
    }

    for (uint i = 0; i < assessmentIds.length; i++) {
      castVote(assessmentIds[i], votes[i]);
    }
  }

  /// Casts a vote on an assessment
  ///
  /// @dev Resets the poll's end date on the first vote. The first vote can only be an accept vote.
  /// If no votes are cast during minVotingPeriodInDays it is automatically considered denied. When
  /// the poll ends in less than silentEndingPeriodInDays, the end date is extended with a potion of
  /// silentEndingPeriodInDays proportional to the user's stake compared to the
  /// total stake on that assessment, namely the sum of tokens used for both accept and deny votes,
  /// but no greater than silentEndingPeriodInDays.
  ///
  /// @param assessmentId  The index of the assessment for which the vote is cast
  /// @param isAcceptVote  True to accept, false to deny
  function castVote(uint assessmentId, bool isAcceptVote) internal {
    {
      require(!hasAlreadyVotedOn[msg.sender][assessmentId], "Already voted");
      hasAlreadyVotedOn[msg.sender][assessmentId] = true;
    }

    uint96 stakeAmount = stakeOf[msg.sender].amount;
    require(stakeAmount > 0, "A stake is required to cast votes");

    Poll memory poll = assessments[assessmentId].poll;
    require(block.timestamp < poll.end, "Voting is closed");
    require(
      poll.accepted > 0 || isAcceptVote,
      "At least one accept vote is required to vote deny"
    );

    if (poll.accepted == 0) {
      // Reset the poll end date on the first accept vote
      poll.end = uint32(block.timestamp + config.minVotingPeriodInDays * 1 days);
    }

    // Check if poll ends in less than 24 hours
    uint silentEndingPeriod = config.silentEndingPeriodInDays * 1 days;
    if (poll.end - block.timestamp < silentEndingPeriod) {
      // Extend proportionally to the user's stake but up to 1 day maximum
      poll.end += uint32(
        Math.min(
          silentEndingPeriod,
          silentEndingPeriod * uint(stakeAmount) / (uint(poll.accepted) + uint(poll.denied))
        )
      );
    }

    if (isAcceptVote) {
      poll.accepted += stakeAmount;
    } else {
      poll.denied += stakeAmount;
    }

    assessments[assessmentId].poll = poll;

    votesOf[msg.sender].push(Vote(
      uint80(assessmentId),
      isAcceptVote,
      uint32(block.timestamp),
      stakeAmount
    ));
  }

  /// Allows governance to submit a merkle tree root hash representing fraudulent stakers
  ///
  /// @dev Leaves' inputs are the sequence of bytes obtained by concatenating:
  /// - Staker address (20 bytes or 160 bits)
  /// - The index of the last fraudulent vote (32 bytes or 256 bits)
  /// - Amount of stake to be burned (12 bytes or 96 bits)
  /// - The number of previous fraud attempts (2 bytes or 16 bits)
  ///
  /// @param root  The merkle tree root hash
  function submitFraud(bytes32 root) external override onlyGovernance {
    fraudResolution.push(root);
    emit FraudSubmitted(root);
  }

  /// Allows anyone to undo fraudulent votes and burn the fraudulent assessors present in the
  /// merkle tree whose hash is submitted through submitFraud
  ///
  /// @param rootIndex                The index of the merkle tree root hash stored in
  ///                                 fraudResolution.
  /// @param proof                    The path from the leaf to the root.
  /// @param assessor                 The address of the fraudulent assessor.
  /// @param lastFraudulentVoteIndex  The index of the last fraudulent vote cast by the assessor.
  /// @param burnAmount               The amount of stake that needs to be burned.
  /// @param fraudCount               The number of times the assessor has taken part in fraudulent
  ///                                 voting.
  /// @param voteBatchSize            The number of iterations that prevents an unbounded loop and
  ///                                 allows chunked processing. Can also be 0 if chunking is not
  ///                                 necessary.
  function processFraud(
    uint256 rootIndex,
    bytes32[] calldata proof,
    address assessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize
  ) external override whenNotPaused {
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
    uint processUntil = _stake.rewardsWithdrawableFromIndex + voteBatchSize;
    if (processUntil >= lastFraudulentVoteIndex) {
      processUntil = lastFraudulentVoteIndex + 1;
    }

    for (uint j = _stake.rewardsWithdrawableFromIndex; j < processUntil; j++) {
      IAssessment.Vote memory vote = votesOf[assessor][j];
      IAssessment.Poll memory poll = assessments[vote.assessmentId].poll;

      {
        if (uint32(block.timestamp) >= poll.end + config.payoutCooldownInDays * 1 days) {
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
      uint32 nextDay = uint32(block.timestamp + 1 days);
      if (poll.end < nextDay) {
        poll.end = nextDay;
      }

      emit FraudProcessed(vote.assessmentId, assessor, poll);
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

    _stake.rewardsWithdrawableFromIndex = uint104(processUntil);
    stakeOf[assessor] = _stake;

  }

  /// Updates configurable parameters through governance
  ///
  /// @param paramNames  An array of elements from UintParams enum
  /// @param values      An array of the new values, each one corresponding to the parameter
  ///                    from paramNames on the same position.
  function updateUintParameters(
    UintParams[] calldata paramNames,
    uint[] calldata values
  ) external override onlyGovernance {
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == IAssessment.UintParams.minVotingPeriodInDays) {
        newConfig.minVotingPeriodInDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.stakeLockupPeriodInDays) {
        newConfig.stakeLockupPeriodInDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.payoutCooldownInDays) {
        newConfig.payoutCooldownInDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.silentEndingPeriodInDays) {
        newConfig.silentEndingPeriodInDays = uint8(values[i]);
        continue;
      }
    }
    config = newConfig;
  }

  /// @dev Updates internal contract addresses to the ones stored in master. This function is
  /// automatically called by the master contract when a contract is added or upgraded.
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
  }

}
