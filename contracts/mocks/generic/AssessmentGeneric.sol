// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IAssessment.sol";

contract AssessmentGeneric is IAssessment {

  Configuration public config;

  mapping(address => Stake) public stakeOf;

  mapping(address => Vote[]) public votesOf;

  Assessment[] public assessments;

  mapping(address => mapping(uint => bool)) public hasAlreadyVotedOn;

  function getAssessmentsCount() external virtual view returns (uint) {
    revert("getAssessmentsCount unsupported");
  }

  function getPoll(uint) external virtual view returns (Poll memory) {
    revert("getPoll unsupported");
  }

  function getRewards(address) external virtual view returns (uint, uint, uint) {
    revert("getRewards unsupported");
  }

  function getVoteCountOfAssessor(address) external virtual view returns (uint) {
    revert("getVoteCountOfAssessor unsupported");
  }

  function stake(uint96) external pure {
    revert("stake unsupported");
  }

  function unstake(uint96, address) external pure {
    revert("unstake unsupported");
  }

  function unstakeAllFor(address) external pure {
    revert("unstakeFor unsupported");
  }

  function withdrawRewards(address, uint104) external virtual returns (uint, uint) {
    revert("withdrawRewards unsupported");
  }

  function withdrawRewardsTo(address, uint104) external virtual returns (uint, uint) {
    revert("withdrawRewardsTo unsupported");
  }

  function startAssessment(uint, uint) external virtual returns (uint) {
    revert("startAssessment unsupported");
  }

  function castVotes(uint[] calldata, bool[] calldata, string[] calldata, uint96) external virtual pure {
    revert("castVotes unsupported");
  }

  function submitFraud(bytes32) external pure {
    revert("submitFraud unsupported");
  }

  function processFraud(uint256, bytes32[] calldata, address, uint256, uint96, uint16, uint256) external pure {
    revert("processFraud unsupported");
  }

  function updateUintParameters(UintParams[] calldata, uint[] calldata) external pure {
    revert("updateUintParameters unsupported");
  }
}
