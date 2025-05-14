// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IPermissionedAssessment {
  struct AssessmentData {
    uint32 assessingGroupId;
    uint32 cooldownPeriod;
  }

  struct AssessmentGroupView {
    uint id;
    bytes32 ipfsMetadata;
    uint[] assessorMemberIds;
  }

  // Groups management

  function makeNewGroup(address[] calldata assessors, bytes32 ipfsMetadata) external returns (uint groupId);

  function addAssessorsToGroup(address[] calldata assessors, uint groupId) external;

  function setGroupMetadata(uint groupId, bytes32 ipfsMetadata) external;

  function removeAssessorsFromGroup(address[] calldata assessors, uint groupId) external;

  function removeAssessorsFromAllGroups(address[] calldata assessors) external;

  // View functions

  function getGroupsCount() external view returns (uint groupCount);

  function getGroupAssessorCount(uint groupId) external view returns (uint assessorCount);

  function getGroupAssessors(uint groupId) external view returns (uint[] memory assessorMemberIds);

  function isAssessorInGroup(uint assessorMemberId, uint groupId) external view returns (bool);

  function getGroupsForAssessor(uint assessorMemberId) external view returns (uint[] memory groupIds);

  function getGroupsData(uint[] calldata groupIds) external view returns (AssessmentGroupView[] memory groups);

  // Events

  event SetAssessmentDataForProductTypes(uint[] productTypeIds, uint cooldownPeriod, uint groupId);
  event AddAssessorToGroup(uint indexed groupId, uint assessorMemberId);
  event RemoveAssessorFromGroup(uint indexed groupId, uint assessorMemberId);
  event SetGroupMetadata(uint indexed groupId, uint ipfsMetadata);

  // Errors

  error MustBeMember(address);
  error InvalidGroupId();
}
