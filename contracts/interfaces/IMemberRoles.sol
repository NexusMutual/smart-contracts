// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMemberRoles {

  enum Role { Unassigned, AdvisoryBoard, Member, Owner }

  function checkRole(address _memberAddress, uint _roleId) external view returns (bool);

  function memberAtIndex(uint _memberRoleId, uint index) external view returns (address, bool);

  function numberOfMembers(uint _memberRoleId) external view returns (uint);

  error MembersAlreadyMigrated();
}
