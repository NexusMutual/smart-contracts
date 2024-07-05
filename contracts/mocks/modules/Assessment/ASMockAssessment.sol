// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import {IAssessment} from "../../../interfaces/IAssessment.sol";

contract ASMockAssessment is IAssessment {
  Configuration public override config;
  mapping(address => Stake) public override stakeOf;
  mapping(address => Vote[]) public override votesOf;

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

  /* ========== VIEWS ========== */

  function getVoteCountOfAssessor(address assessor) external view override returns (uint) {
    return votesOf[assessor].length;
  }

  function getAssessmentsCount() external pure override returns (uint) {
    revert("Not yet implemented");
  }

  function assessments(uint) external pure override returns (Poll memory, uint128, uint128) {
    revert("Not yet implemented");
  }

  function getPoll(uint) external pure override returns (Poll memory) {
    revert("Not yet implemented");
  }

  function getRewards(address) external pure override returns (uint, uint, uint) {
    revert("Not yet implemented");
  }

  function hasAlreadyVotedOn(address, uint) external pure override returns (bool) {
    revert("Not yet implemented");
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function stake(uint96) external pure override {
    revert("Not yet implemented");
  }

  function unstake(uint96, address) external pure override {
    revert("Not yet implemented");
  }

  function withdrawRewards(address, uint104) external pure override returns (uint, uint) {
    revert("Not yet implemented");
  }

  function withdrawRewardsTo(address, uint104) external pure override returns (uint, uint) {
    revert("Not yet implemented");
  }

  function startAssessment(uint, uint) external pure override returns (uint) {
    revert("Not yet implemented");
  }

  function castVotes(uint[] calldata, bool[] calldata, string[] calldata, uint96) external pure override {
    revert("Not yet implemented");
  }

  function submitFraud(bytes32) external pure override {
    revert("Not yet implemented");
  }

  function processFraud(uint256, bytes32[] calldata, address, uint256, uint96, uint16, uint256) external pure override {
    revert("Not yet implemented");
  }

  function updateUintParameters(UintParams[] calldata, uint[] calldata) external pure override {
    revert("Not yet implemented");
  }
}
