// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IAssessments.sol";

contract AssessmentGeneric is IAssessments {
  function addAssessorsToGroup(uint[] calldata, uint) external virtual {
    revert("Unsupported");
  }

  function setGroupMetadata(uint, bytes32) external virtual {
    revert("Unsupported");
  }

  function removeAssessorFromGroup(uint, uint) external virtual {
    revert("Unsupported");
  }

  function removeAssessorFromAllGroups(uint) external virtual {
    revert("Unsupported");
  }

  function setAssessmentDataForProductTypes(uint[] calldata, uint, uint, uint) external virtual {
    revert("Unsupported");
  }

  function undoVotes(uint, uint[] calldata) external virtual {
    revert("Unsupported");
  }

  function castVote(uint, bool, bytes32) external virtual {
    revert("Unsupported");
  }

  function startAssessment(uint, uint, uint) external virtual {
    revert("Unsupported");
  }

  function extendVotingPeriod(uint) external virtual {
    revert("Unsupported");
  }

  function minVotingPeriod() external pure virtual returns (uint) {
    revert("Unsupported");
  }

  function getBallotsMetadata(uint, uint) external view virtual returns (bytes32) {
    revert("Unsupported");
  }

  function resetVotingPeriod(uint) external virtual {
    revert("Unsupported");
  }

  function closeVotingEarly(uint) external virtual {
    revert("Unsupported");
  }

  /* ========== VIEWS ========== */

  function getGroupsCount() external view virtual returns (uint) {
    revert("Unsupported");
  }

  function getGroupAssessorCount(uint) external view virtual returns (uint) {
    revert("Unsupported");
  }

  function getGroupAssessors(uint) external view virtual returns (uint[] memory) {
    revert("Unsupported");
  }

  function isAssessorInGroup(uint, uint) external view virtual returns (bool) {
    revert("Unsupported");
  }

  function getGroupsForAssessor(uint) external view virtual returns (uint[] memory) {
    revert("Unsupported");
  }

  function isAssessor(uint) external view virtual returns (bool) {
    revert("Unsupported");
  }

  function getGroupsData(uint[] calldata) external view virtual returns (AssessmentGroupView[] memory) {
    revert("Unsupported");
  }

  function votingPeriod() external view virtual returns (uint) {
    revert("Unsupported");
  }

  function assessorGroupOf(uint) external view virtual returns (uint32) {
    revert("Unsupported");
  }

  function setAssessingGroupIdForProductTypes(uint[] calldata, uint) external view virtual {
    revert("Unsupported");
  }

  function ballotOf(uint, uint) external view virtual returns (Ballot memory) {
    revert("Unsupported");
  }

  function getAssessment(uint) external view virtual returns (Assessment memory) {
    revert("Unsupported");
  }

  function getAssessingGroupIdForProductType(uint) external view virtual returns (uint) {
    revert("Unsupported");
  }
}
