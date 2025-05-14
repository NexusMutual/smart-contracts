// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IPermissionedAssessment {
  struct AssessmentData {
    uint32 assessingGroupId;
    uint32 cooldownPeriod;
  }

  struct AssessmentGroupView {
    uint id;
    string ipfsMetadata;
    address[] assessors;
  }

  // Groups management

  function makeNewGroup(address[] calldata assessors, string calldata ipfsMetadata) external returns (uint groupId);

  function addAssessorsToGroup(address[] calldata assessors, uint groupId) external;

  function setGroupMetadata(uint groupId, string calldata ipfsMetadata) external;

  function removeAssessorsFromGroup(address[] calldata assessors, uint groupId) external;

  function removeAssessorsFromAllGroups(address[] calldata assessors) external;

  // View functions

  function getGroupsCount() external view returns (uint groupCount);

  function getGroupAssessorCount(uint groupId) external view returns (uint assessorCount);

  function getGroupAssessors(uint groupId) external view returns (address[] memory assessors);

  function isAssessorInGroup(address assessor, uint groupId) external view returns (bool);

  function getGroupsForAssessor(address assessor) external view returns (uint[] memory groupIds);

  function getGroupsData(uint[] calldata groupIds) external view returns (AssessmentGroupView[] memory groups);

  // Events

  event SetAssessmentDataForProductTypes(uint[] productTypeIds, uint cooldownPeriod, uint groupId);
  event AddAssessorsToGroup(uint indexed groupId, address[] assessors);
  event RemoveAssessorsFromGroup(uint indexed groupId, address[] assessors);
  event RemoveAssessorsFromAllGroups(address[] assessors);
}
