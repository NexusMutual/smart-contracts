// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import {IAssessment} from "../../../interfaces/IAssessment.sol";

contract ASMockAssessment is IAssessment {
  Configuration public override config;
  mapping(address => Stake) public override stakeOf;
  mapping(address => Vote[]) public override votesOf;
  uint totalPendingAmountInNXM;
  uint withdrawableAmountInNXM;
  uint withdrawableUntilIndex;

  constructor(
    uint8 minVotingPeriodInDays,
    uint8 stakeLockupPeriodInDays,
    uint8 payoutCooldownInDays,
    uint8 silentEndingPeriodInDays
  ) {
    config = Configuration({
      minVotingPeriodInDays: minVotingPeriodInDays,
      stakeLockupPeriodInDays: stakeLockupPeriodInDays,
      payoutCooldownInDays: payoutCooldownInDays,
      silentEndingPeriodInDays: silentEndingPeriodInDays
    });
  }

  /* ========== SETTERS ========== */

  function setVotesOf(address assessor, uint96 stakeAmount, uint assessmentId, bool isAcceptVote) external {
    votesOf[assessor].push(Vote(uint80(assessmentId), isAcceptVote, uint32(block.timestamp), stakeAmount));
  }

  function setStakeOf(
    address assessor,
    uint96 amount,
    uint104 rewardsWithdrawableFromIndex,
    uint16 fraudCount
  ) external {
    stakeOf[assessor] = Stake({
      amount: amount,
      rewardsWithdrawableFromIndex: rewardsWithdrawableFromIndex,
      fraudCount: fraudCount
    });
  }

  function setRewards(
    uint _totalPendingAmountInNXM,
    uint _withdrawableAmountInNXM,
    uint _withdrawableUntilIndex
  ) external {
    totalPendingAmountInNXM = _totalPendingAmountInNXM;
    withdrawableAmountInNXM = _withdrawableAmountInNXM;
    withdrawableUntilIndex = _withdrawableUntilIndex;
  }

  /* ========== VIEWS ========== */

  function getVoteCountOfAssessor(address assessor) external view override returns (uint) {
    return votesOf[assessor].length;
  }

  function getRewards(address) external view override returns (uint, uint, uint) {
    return (totalPendingAmountInNXM, withdrawableAmountInNXM, withdrawableUntilIndex);
  }

  /* ========== NOT YET IMPLEMENTED ========== */

  function getAssessmentsCount() external pure override returns (uint) {
    revert("getAssessmentsCount not yet implemented");
  }

  function assessments(uint) external pure override returns (Poll memory, uint128, uint128) {
    revert("assessments not yet implemented");
  }

  function getPoll(uint) external pure override returns (Poll memory) {
    revert("getPoll not yet implemented");
  }

  function hasAlreadyVotedOn(address, uint) external pure override returns (bool) {
    revert("hasAlreadyVotedOn not yet implemented");
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function stake(uint96) external pure override {
    revert("stake not yet implemented");
  }

  function unstake(uint96, address) external pure override {
    revert("unstake not yet implemented");
  }

  function withdrawRewards(address, uint104) external pure override returns (uint, uint) {
    revert("withdrawRewards not yet implemented");
  }

  function withdrawRewardsTo(address, uint104) external pure override returns (uint, uint) {
    revert("withdrawRewardsTo not yet implemented");
  }

  function startAssessment(uint, uint) external pure override returns (uint) {
    revert("startAssessment not yet implemented");
  }

  function castVotes(uint[] calldata, bool[] calldata, string[] calldata, uint96) external pure override {
    revert("castVotes not yet implemented");
  }

  function submitFraud(bytes32) external pure override {
    revert("submitFraud not yet implemented");
  }

  function processFraud(uint256, bytes32[] calldata, address, uint256, uint96, uint16, uint256) external pure override {
    revert("processFraud not yet implemented");
  }

  function updateUintParameters(UintParams[] calldata, uint[] calldata) external pure override {
    revert("updateUintParameters not yet implemented");
  }
}
