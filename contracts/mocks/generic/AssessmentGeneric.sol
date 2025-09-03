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

  function startAssessment(uint, uint) external virtual {
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

  function getGroupsCount() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getGroupAssessorCount(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getGroupAssessors(uint) external virtual view returns (uint[] memory) {
    revert("Unsupported");
  }

  function isAssessorInGroup(uint, uint) external virtual view returns (bool) {
    revert("Unsupported");
  }

  function getGroupsForAssessor(uint) external virtual view returns (uint[] memory) {
    revert("Unsupported");
  }

  function isAssessor(uint) external virtual view returns (bool) {
    revert("Unsupported");
  }

  function getGroupsData(uint[] calldata) external virtual view returns (AssessmentGroupView[] memory) {
    revert("Unsupported");
  }

  function votingPeriod() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function payoutCooldown(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function assessorGroupOf(uint) external virtual view returns (uint32) {
    revert("Unsupported");
  }

  function getAssessmentDataForProductType(uint) external virtual view returns (AssessmentData memory) {
    revert("Unsupported");
  }

  function ballotOf(uint, uint) external virtual view returns (Ballot memory) {
    revert("Unsupported");
  }

  function getAssessment(uint) external virtual view returns (Assessment memory) {
    revert("Unsupported");
  }
}
