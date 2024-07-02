// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/INXMMaster.sol";
import "../../../interfaces/IMemberRoles.sol";
import "../../generic/MemberRolesGeneric.sol";

contract ASMockMemberRoles is MemberRolesGeneric {
  mapping(address => uint) public _members;

  function enrollMember(address newMember, uint role) public {
    _members[newMember] = role;
  }

  function checkRole(address user, uint role) public override view returns (bool) {
    return _members[user] == role;
  }

  function isMember(address user) external view returns (bool) {
    return checkRole(user, uint(IMemberRoles.Role.Member));
  }

  function members(address user) external view returns (uint roleId) {
    return _members[user];
  }

}
