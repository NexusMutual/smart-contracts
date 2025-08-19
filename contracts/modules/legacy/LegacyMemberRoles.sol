// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/RegistryAware.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IMemberRolesErrors.sol";
import "../../interfaces/INXMToken.sol";

contract LegacyMemberRoles is IMemberRoles, IMemberRolesErrors, RegistryAware {

  struct MemberRoleDetails {
    uint memberCounter;
    mapping(address => bool) memberActive;
    address[] memberAddress;
    address authorized;
  }

  address internal _unusedMGV; // was Master from GoVerned
  address internal _unusedMMA; // was Master from MasterAwareV2
  uint internal _unusedCMA; // was Contract mapping from MasterAwareV2
  address internal _unused5; // was TokenController
  address internal _unused6; // was address payable public poolAddress;
  address internal _unused7; // was kycAuthAddress
  address internal _unused8; // was ICover internal cover;
  address internal _unused9;
  address internal _unused10;
  address internal _unused11; // was INXMToken public nxm;

  MemberRoleDetails[] internal memberRoleData;

  bool internal _unused12;
  uint internal _unused13;
  bool internal _unused14;
  uint internal _unused15;
  mapping(address => address) internal _unused16;
  mapping(address => bool) internal _unused17;
  mapping(bytes32 => bool) internal _unused18; // usedMessageHashes

  uint public nextMemberStorageIndex;

  INXMToken public immutable nxmToken;

  constructor(address registryAddress) RegistryAware(registryAddress) {
    nxmToken = INXMToken(fetch(C_TOKEN));
  }

  function isMember(address member) public view returns (bool) {
    return checkRole(member, uint(IMemberRoles.Role.Member));
  }

  function checkRole(
    address memberAddress,
    uint roleId
  ) public view returns (bool) {

    if (roleId == uint(Role.Unassigned)) {
      return true;
    }

    // todo: return local storage info if not migrated yet

    if (roleId == uint(Role.Member)) {
      return registry.isMember(memberAddress);
    }

    if (roleId == uint(Role.AdvisoryBoard)) {
      return registry.isAdvisoryBoardMember(memberAddress);
    }

    return false;
  }

  function switchMembership(address newAddress) external {
    uint memberCount = memberRoleData[uint(Role.Member)].memberCounter;
    require(nextMemberStorageIndex >= memberCount, "MemberRoles: Migration in progress");
    registry.switchFor(msg.sender, newAddress); // proxy the call
    nxmToken.transferFrom(msg.sender, newAddress, nxmToken.balanceOf(msg.sender));
  }

  function numberOfMembers(uint _memberRoleId) external view returns (uint) {
    return memberRoleData[_memberRoleId].memberCounter;
  }

  function memberAtIndex(
    uint _memberRoleId,
    uint index
  ) external view returns (address _address, bool _active) {
    _address = memberRoleData[_memberRoleId].memberAddress[index];
    _active = memberRoleData[_memberRoleId].memberActive[_address];
    return (_address, _active);
  }

  function migrateMembers(uint batchSize) external {

    MemberRoleDetails storage roleDetails = memberRoleData[uint(Role.Member)];

    uint memberCount = roleDetails.memberCounter;
    uint _nextStorageIndex = nextMemberStorageIndex;
    require(_nextStorageIndex < memberCount, "MemberRoles: Already migrated");

    // on the first call, transfer all ETH to the Pool contract
    if (_nextStorageIndex == 0) {
      address poolAddress = fetch(C_POOL);
      (bool success, ) = poolAddress.call{ value: address(this).balance }("");
      require(success, "MemberRoles: Failed to transfer ETH to Pool");
    }

    address[] memory members = new address[](batchSize);
    uint currentMemoryIndex;

    while(currentMemoryIndex < batchSize && _nextStorageIndex < memberCount) {

      address memberAddress = roleDetails.memberAddress[_nextStorageIndex++];
      bool isActive = roleDetails.memberActive[memberAddress];

      if (isActive) {
        members[currentMemoryIndex] = memberAddress;
        currentMemoryIndex++;
      }
    }

    registry.migrateMembers(members);
    nextMemberStorageIndex = _nextStorageIndex;
  }

}
