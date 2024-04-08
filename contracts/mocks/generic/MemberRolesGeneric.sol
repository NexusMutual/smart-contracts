// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IMemberRoles.sol";

contract MemberRolesGeneric is IMemberRoles {

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

  function members(uint) external virtual view returns (uint, address[] memory) {
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

  function checkRole(address, uint) external virtual view returns (bool) {
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
