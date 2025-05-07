// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";

import "../../abstract/RegistryAware.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IMemberRolesErrors.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IAssessment.sol";

contract MemberRoles is IMemberRoles, IMemberRolesErrors, RegistryAware {

  struct MemberRoleDetails {
    uint memberCounter;
    mapping(address => bool) memberActive;
    address[] memberAddress;
    address authorized;
  }

  address internal _unusedMGV; // was Master from GoVerned
  address internal _unusedMMA; // was Master from MasterAwareV2
  uint internal _unusedCMA; // was Contract mapping from MasterAwareV2
  address internal _unused5; // was ITokenController public tc;
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

  constructor(address registryAddress) RegistryAware(registryAddress) { }

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
