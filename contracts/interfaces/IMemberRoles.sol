// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMemberRoles {

  enum Role {Unassigned, AdvisoryBoard, Member, Owner}

  function join(address _userAddress, uint nonce, bytes calldata signature) external payable;

  function switchMembership(address _newAddress) external;

  function switchMembershipAndAssets(
    address newAddress,
    uint[] calldata coverIds,
    uint[] calldata stakingTokenIds
  ) external;

  function switchMembershipOf(address member, address _newAddress) external;

  function totalRoles() external view returns (uint256);

  function changeAuthorized(uint _roleId, address _newAuthorized) external;

  function setKycAuthAddress(address _add) external;

  function members(uint _memberRoleId) external view returns (uint, address[] memory memberArray);

  function numberOfMembers(uint _memberRoleId) external view returns (uint);

  function authorized(uint _memberRoleId) external view returns (address);

  function roles(address _memberAddress) external view returns (uint[] memory);

  function checkRole(address _memberAddress, uint _roleId) external view returns (bool);

  function getMemberLengthForAllRoles() external view returns (uint[] memory totalMembers);

  function memberAtIndex(uint _memberRoleId, uint index) external view returns (address, bool);

  function membersLength(uint _memberRoleId) external view returns (uint);

  event MemberRole(uint256 indexed roleId, bytes32 roleName, string roleDescription);

  event MemberJoined(address indexed newMember, uint indexed nonce);

  event switchedMembership(address indexed previousMember, address indexed newMember, uint timeStamp);
}
