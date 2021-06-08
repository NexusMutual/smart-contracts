// SPDX-License-Identifier: GPL-3.0

/* Copyright (C) 2021 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity >=0.5.0;

interface IMemberRoles {

  enum Role {UnAssigned, AdvisoryBoard, Member, Owner}

  function payJoiningFee(address _userAddress) external payable;

  function switchMembership(address _newAddress) external;

  function switchMembershipOf(address member, address _newAddress) external;

  function swapOwner(address _newOwnerAddress) external;

  function kycVerdict(address payable _userAddress, bool verdict) external;

  function getClaimPayoutAddress(address payable _member) external view returns (address payable);

  function setClaimPayoutAddress(address payable _address) external;

  function totalRoles() external view returns (uint256);

  function changeAuthorized(uint _roleId, address _newAuthorized) external;

  function members(uint _memberRoleId) external view returns (uint, address[] memory memberArray);

  function numberOfMembers(uint _memberRoleId) external view returns (uint);

  function authorized(uint _memberRoleId) external view returns (address);

  function roles(address _memberAddress) external view returns (uint[] memory);

  function checkRole(address _memberAddress, uint _roleId) external view returns (bool);

  function getMemberLengthForAllRoles() external view returns (uint[] memory totalMembers);

  function memberAtIndex(uint _memberRoleId, uint index) external view returns (address, bool);

  function membersLength(uint _memberRoleId) external view returns (uint);
}
