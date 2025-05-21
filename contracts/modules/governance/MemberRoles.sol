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
import "./external/Governed.sol";

contract MemberRoles is IMemberRoles, IMemberRolesErrors, RegistryAware {

  address internal _unusedMGV; // was Master from GoVerned
  address internal _unusedMMA; // was Master from MasterAwareV2
  uint internal _unusedCMA; // was Contract mapping from MasterAwareV2

  struct MemberRoleDetails {
    uint memberCounter;
    mapping(address => bool) memberActive;
    address[] memberAddress;
    address authorized;
  }

  address internal _unused5; // was ITokenController public tc;
  address internal _unused6; // was address payable public poolAddress;
  address internal _unused6_5; // was kycAuthAddress
  address internal _unused7; // was ICover internal cover;
  address internal _unused0;
  address internal _unused1;
  address internal _unused8; // was INXMToken public nxm;

  MemberRoleDetails[] internal memberRoleData;
  bool internal _unused2;

  uint public maxABCount;
  bool public launched;
  uint public launchedOn;

  mapping(address => address) internal _unused3;
  mapping(address => bool) internal _unused4;

  mapping(bytes32 => bool) public usedMessageHashes;

  // Prefixes for ECDSA signatures' scope
  bytes32 public constant MEMBERSHIP_APPROVAL = bytes32('MEMBERSHIP_APPROVAL');
  uint public constant joiningFee = 0.002 ether;

  constructor(address registryAddress) RegistryAware(registryAddress) {
    // empty
  }

  function isMember(address member) public view returns (bool) {
    return checkRole(member, uint(IMemberRoles.Role.Member));
  }

  function memberAtIndex(uint /* _memberRoleId */, uint /* index */) external view returns (address, bool) {
    block.timestamp;
    revert("Not implemented");
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
      uint memberId = registry.getMemberId(memberAddress);
      return registry.isAdvisoryBoardMember(memberId);
    }

    return false;
  }

  function numberOfMembers(uint _memberRoleId) external view returns (uint) {
    return memberRoleData[_memberRoleId].memberCounter;
  }

}
