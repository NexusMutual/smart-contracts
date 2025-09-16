// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMemberRoles {

  enum Role { Unassigned, AdvisoryBoard, Member, Owner }

  function checkRole(address _address, uint _roleId) external view returns (bool);

  function numberOfMembers(uint _memberRoleId) external view returns (uint);

  function switchMembership(address newAddress) external;

}
