// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

// todo: check for openzeppelin v5
import {EnumerableSet} from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

import {IPermissionedAssessment} from "../../interfaces/IPermissionedAssessment.sol";
import {MasterAwareV2} from "../../abstract/MasterAwareV2.sol";
import {SafeUintCast} from "../../libraries/SafeUintCast.sol";

contract PermissionedAssessment is IPermissionedAssessment, MasterAwareV2 {
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.UintSet;
  using SafeUintCast for uint;

  // todo: do we want this in struct or in a separate mappings
  // todo: change AddressSet to UintSet to be memberIds
  mapping(uint groupId => EnumerableSet.AddressSet) private _group;
  mapping(uint groupId => string) private _groupMetadata; // todo: discuss change to bytes32 for ipfs data (cid)
  uint private _groupsCount;

  mapping(address assessor => EnumerableSet.UintSet) private _groupsForAssessor;

  mapping(uint productTypeId => AssessmentData) private _assessmentData;

  // todo: check if we want setProductTypes.setProductTypes to also be able to call this function
  function setAssessmentDataForProductTypes(
    uint[] calldata productTypeIds,
    uint cooldownPeriod,
    uint groupId
  ) external onlyAdvisoryBoard {
    uint length = productTypeIds.length;
    for (uint i = 0; i < length; i++) {
      _assessmentData[productTypeIds[i]] = AssessmentData({
        assessingGroupId: groupId.toUint32(),
        cooldownPeriod: cooldownPeriod.toUint32()
      });
    }

    emit SetAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, groupId);
  }

  // Group management

  // todo: check if address is member / get it's memberId
  function _addAssessorsToGroup(address[] calldata assessors, uint groupId) internal {
    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      address assessor = assessors[i];
      _group[groupId].add(assessor);
      _groupsForAssessor[assessor].add(groupId);
    }

    emit AddAssessorsToGroup(groupId, assessors);
  }

  function makeNewGroup(
    address[] calldata assessors,
    string calldata ipfsMetadata
  ) external onlyAdvisoryBoard returns (uint groupId) {
    groupId = ++_groupsCount;
    _groupMetadata[groupId] = ipfsMetadata;
    _addAssessorsToGroup(assessors, groupId);
  }

  function addAssessorsToGroup(address[] calldata assessors, uint groupId) external onlyAdvisoryBoard {
    _addAssessorsToGroup(assessors, groupId);
  }

  function setGroupMetadata(uint groupId, string calldata ipfsMetadata) external onlyAdvisoryBoard {
    _groupMetadata[groupId] = ipfsMetadata;
  }

  function removeAssessorsFromGroup(address[] calldata assessors, uint groupId) external onlyAdvisoryBoard {
    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      address assessor = assessors[i];
      _group[groupId].remove(assessor);
      _groupsForAssessor[assessor].remove(groupId);
    }
    emit RemoveAssessorsFromGroup(groupId, assessors);
  }

  function removeAssessorsFromAllGroups(address[] calldata assessors) external onlyAdvisoryBoard {
    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      address assessor = assessors[i];

      uint[] memory assessorsGroups = _groupsForAssessor[assessor].values();
      uint assessorsGroupsLength = assessorsGroups.length;
      for (uint groupIndex = 0; groupIndex < assessorsGroupsLength; groupIndex++) {
        uint groupId = assessorsGroups[groupIndex];
        _group[groupId].remove(assessor);
      }

      // todo: there is no clear in oz v4 set, we should use v5
      // _groupsForAssessor[assessor].clear();
    }

    emit RemoveAssessorsFromAllGroups(assessors);
  }

  // View functions

  function getGroupsCount() external view returns (uint groupCount) {
    groupCount = _groupsCount;
  }

  function getGroupAssessorCount(uint groupId) external view returns (uint assessorCount) {
    assessorCount = _group[groupId].length();
  }

  function getGroupAssessors(uint groupId) external view returns (address[] memory assessors) {
    assessors = _group[groupId].values();
  }

  function isAssessorInGroup(address assessor, uint groupId) external view returns (bool) {
    return _group[groupId].contains(assessor);
  }

  function getGroupsForAssessor(address assessor) external view returns (uint[] memory groupIds) {
    groupIds = _groupsForAssessor[assessor].values();
  }

  function getGroupsData(uint[] calldata groupIds) external view returns (AssessmentGroupView[] memory groups) {
    uint length = groupIds.length;
    groups = new AssessmentGroupView[](length);

    for (uint i = 0; i < length; i++) {
      uint groupId = groupIds[i];
      groups[i] = AssessmentGroupView({
        id: groupId,
        ipfsMetadata: _groupMetadata[groupId],
        assessors: _group[groupId].values()
      });
    }

    return groups;
  }

  function changeDependentContractAddress() external {}
}
