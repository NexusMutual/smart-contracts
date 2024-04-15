// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/INXMMaster.sol";
import "../../generic/MemberRolesGeneric.sol";

contract RAMockMemberRoles is MemberRolesGeneric {
  mapping(address => uint) public membersData;

  function enrollMember(address newMember, uint role) public {
    membersData[newMember] = role;
  }

  function checkRole(address user, uint role) external override view returns (bool) {
    return membersData[user] == role;
  }

  function isMember(address user) external view returns (bool) {
    return membersData[user] == uint(IMemberRoles.Role.Member);
  }
}
