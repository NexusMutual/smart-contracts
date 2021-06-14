// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

contract MemberRolesMock {

  enum Role { UnAssigned, AdvisoryBoard, Member, Owner }

  function memberAtIndex(uint, uint) external pure returns (address, bool) {
    revert("Unexpected MemberRolesMock call");
  }

  function membersLength(uint) external pure returns (uint) {
    return 0;
  }

}
