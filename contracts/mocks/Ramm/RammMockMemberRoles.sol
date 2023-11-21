// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IMemberRoles.sol";

contract RammMockMemberRoles is IMemberRoles {
  mapping(address => uint) public membersData;

  function enrollMember(address newMember, uint role) public {
    membersData[newMember] = role;
  }

  function checkRole(address user, uint role) external view returns (bool) {
    return membersData[user] == role;
  }

  function isMember(address user) external view returns (bool) {
    return membersData[user] == uint(IMemberRoles.Role.Member);
  }

  function members(uint) external pure returns (uint, address[] memory) {
    revert("Unsupported");
  }

  function join(address, uint, bytes calldata) external payable {
    revert("Unsupported");
  }

  function switchMembership(address) external pure {
    revert("Unsupported");
  }

  function switchMembershipAndAssets(address, uint[] calldata, uint[] calldata) external pure {
    revert("Unsupported");
  }

  function switchMembershipOf(address, address) external pure {
    revert("Unsupported");
  }

  function totalRoles() external pure returns (uint256) {
    revert("Unsupported");
  }

  function changeAuthorized(uint, address) external pure {
    revert("Unsupported");
  }

  function setKycAuthAddress(address) external pure {
    revert("Unsupported");
  }

  function numberOfMembers(uint) external pure returns (uint) {
    revert("Unsupported");
  }

  function authorized(uint) external pure returns (address) {
    revert("Unsupported");
  }

  function roles(address) external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function getMemberLengthForAllRoles() external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function memberAtIndex(uint, uint) external pure returns (address, bool) {
    revert("Unsupported");
  }

  function membersLength(uint) external pure returns (uint) {
    revert("Unsupported");
  }

}
