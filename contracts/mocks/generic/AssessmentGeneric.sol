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
    revert("Unsupported");
  }

  function getPoll(uint) external virtual view returns (Poll memory) {
    revert("Unsupported");
  }

  function getRewards(address) external pure returns (uint, uint, uint) {
    revert("Unsupported");
  }

  function getVoteCountOfAssessor(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function stake(uint96) external pure {
    revert("Unsupported");
  }

  function unstake(uint96, address) external pure {
    revert("Unsupported");
  }

  function withdrawRewards(address, uint104) external virtual returns (uint, uint) {
    revert("Unsupported");
  }

  function withdrawRewardsTo(address, uint104) external virtual returns (uint, uint) {
    revert("Unsupported");
  }

  function startAssessment(uint, uint) external virtual returns (uint) {
    revert("Unsupported");
  }

  function castVotes(uint[] calldata, bool[] calldata, string[] calldata, uint96) external virtual pure {
    revert("Unsupported");
  }

  function submitFraud(bytes32) external pure {
    revert("Unsupported");
  }

  function processFraud(uint256, bytes32[] calldata, address, uint256, uint96, uint16, uint256) external pure {
    revert("Unsupported");
  }

  function updateUintParameters(UintParams[] calldata, uint[] calldata) external pure {
    revert("Unsupported");
  }
}
