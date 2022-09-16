// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IMemberRoles.sol";

contract ASMockMemberRoles {
  mapping(address => uint) public members;

  function enrollMember(address newMember, uint role) public {
    members[newMember] = role;
  }

  function checkRole(address user, uint role) external view returns (bool) {
    return members[user] == role;
  }

  function isMember(address user) external view returns (bool) {
    return members[user] == uint(IMemberRoles.Role.Member);
  }

}
