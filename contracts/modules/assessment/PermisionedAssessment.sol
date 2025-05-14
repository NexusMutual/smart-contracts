// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import {EnumerableSet} from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

import {IPermissionedAssessment} from "../../interfaces/IPermissionedAssessment.sol";
import {MasterAwareV2} from "../../abstract/MasterAwareV2.sol";
import {SafeUintCast} from "../../libraries/SafeUintCast.sol";

contract PermissionedAssessment is IPermissionedAssessment, MasterAwareV2 {
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.UintSet;
  using SafeUintCast for uint;

  // todo: do we want this in struct or in a separate mappings
  mapping(uint groupId => EnumerableSet.UintSet) private _group;
  mapping(uint groupId => bytes32) private _groupMetadata;
  uint private _groupsCount;

  // todo: should this be a set? maybe map is enough here
  mapping(uint assessorMemberId => EnumerableSet.UintSet) private _groupsForAssessor;

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

  function addAssessorsToGroup(address[] calldata assessors, uint groupId) external onlyAdvisoryBoard {
    // make new group id
    if (groupId == 0) {
      groupId = ++_groupsCount;
    }

    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      uint assessorMemberId = _memberRoles().getMemberId(assessors[i]);
      require(assessorMemberId != 0, MustBeMember(assessors[i]));
      _group[groupId].add(assessorMemberId);
      _groupsForAssessor[assessorMemberId].add(groupId);
      emit AddAssessorToGroup(groupId, assessorMemberId);
    }
  }

  function setGroupMetadata(uint groupId, bytes32 ipfsMetadata) external onlyAdvisoryBoard {
    require(groupId > 0 && groupId <= _groupsCount, InvalidGroupId());

    _groupMetadata[groupId] = ipfsMetadata;
    emit SetGroupMetadata(groupId, bytes32 ipfsMetadata);
  }

  // todo: remove by address or by memberId?
  function removeAssessorsFromGroup(address[] calldata assessors, uint groupId) external onlyAdvisoryBoard {
    require(groupId > 0 && groupId <= _groupsCount, InvalidGroupId());

    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      uint assessorMemberId = _memberRoles().getMemberId(assessors[i]);
      require(assessorMemberId != 0, MustBeMember(assessors[i]));
      _group[groupId].remove(assessorMemberId);
      _groupsForAssessor[assessorMemberId].remove(groupId);
      emit RemoveAssessorFromGroup(groupId, assessorMemberId);
    }
  }

  function removeAssessorsFromAllGroups(address[] calldata assessors) external onlyAdvisoryBoard {
    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      uint assessorMemberId = _memberRoles().getMemberId(assessors[i]);
      require(assessorMemberId != 0, MustBeMember(assessors[i]));

      uint[] memory assessorsGroups = _groupsForAssessor[assessorMemberId].values();
      uint assessorsGroupsLength = assessorsGroups.length;
      for (uint groupIndex = 0; groupIndex < assessorsGroupsLength; groupIndex++) {
        uint groupId = assessorsGroups[groupIndex];
        _group[groupId].remove(assessorMemberId);
         emit RemoveAssessorFromGroup(groupId, assessorMemberId);
      }

      _clearSet(_groupsForAssessor[assessorMemberId]._inner);
    }
  }

  function _clearSet(EnumerableSet.Set storage set) internal {
      uint256 len = set._values.length;
      for (uint256 i = 0; i < len; ++i) {
          delete set._indexes[set._values[i]];
      }
      delete set._values;

      // todo: check using a bit more optimized:
      // assembly {
      //   sstore(set._values.slot, 0);
      // }
  }

  // View functions

  function getGroupsCount() external view returns (uint groupCount) {
    groupCount = _groupsCount;
  }

  function getGroupAssessorCount(uint groupId) external view returns (uint assessorCount) {
    assessorCount = _group[groupId].length();
  }

  function getGroupAssessors(uint groupId) external view returns (uint[] memory assessorMemberIds) {
    assessorMemberIds = _group[groupId].values();
  }

  function isAssessorInGroup(uint assessorMemberId, uint groupId) external view returns (bool) {
    return _group[groupId].contains(assessorMemberId);
  }

  function getGroupsForAssessor(uint assessorMemberId) external view returns (uint[] memory groupIds) {
    groupIds = _groupsForAssessor[assessorMemberId].values();
  }

  function getGroupsData(uint[] calldata groupIds) external view returns (AssessmentGroupView[] memory groups) {
    uint length = groupIds.length;
    groups = new AssessmentGroupView[](length);

    for (uint i = 0; i < length; i++) {
      uint groupId = groupIds[i];
      groups[i] = AssessmentGroupView({
        id: groupId,
        ipfsMetadata: _groupMetadata[groupId],
        assessorMemberIds: _group[groupId].values()
      });
    }

    return groups;
  }

  /* ========== DEPENDENCIES ========== */

  /// @notice Gets the MemberRoles contract instance
  /// @return The MemberRoles contract interface
  /// @dev Used to access member role functionality throughout the contract
  function _memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(getInternalContractAddress(ID.MR));
  }

  /// @notice Updates internal contract addresses when contracts are added or upgraded
  /// @dev Automatically called by the master contract during system updates
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
  }
}
