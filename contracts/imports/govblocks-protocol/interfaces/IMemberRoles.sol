/* Copyright (C) 2017 GovBlocks.io
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

pragma solidity 0.4.24;


contract IMemberRoles {

    event MemberRole(uint256 indexed roleId, bytes32 roleName, string roleDescription);
    
    /// @dev Adds new member role
    /// @param _roleName New role name
    /// @param _roleDescription New description hash
    /// @param _authorized Authorized member against every role id
    function addRole(bytes32 _roleName, string _roleDescription, address _authorized) public;

    /// @dev Assign or Delete a member from specific role.
    /// @param _memberAddress Address of Member
    /// @param _roleId RoleId to update
    /// @param _active active is set to be True if we want to assign this role to member, False otherwise!
    function updateRole(address _memberAddress, uint _roleId, bool _active) public;

    /// @dev Change Member Address who holds the authority to Add/Delete any member from specific role.
    /// @param _roleId roleId to update its Authorized Address
    /// @param _authorized New authorized address against role id
    function changeAuthorized(uint _roleId, address _authorized) public;

    /// @dev Return number of member roles
    function totalRoles() public view returns(uint256);

    /// @dev Gets the member addresses assigned by a specific role
    /// @param _memberRoleId Member role id
    /// @return roleId Role id
    /// @return allMemberAddress Member addresses of specified role id
    function members(uint _memberRoleId) public view returns(uint, address[] allMemberAddress);

    /// @dev Gets all members' length
    /// @param _memberRoleId Member role id
    /// @return memberRoleData[_memberRoleId].memberAddress.length Member length
    function numberOfMembers(uint _memberRoleId) public view returns(uint);
    
    /// @dev Return member address who holds the right to add/remove any member from specific role.
    function authorized(uint _memberRoleId) public view returns(address);

    /// @dev Get All role ids array that has been assigned to a member so far.
    function roles(address _memberAddress) public view returns(uint[] assignedRoles);

    /// @dev Returns true if the given role id is assigned to a member.
    /// @param _memberAddress Address of member
    /// @param _roleId Checks member's authenticity with the roleId.
    /// i.e. Returns true if this roleId is assigned to member
    function checkRole(address _memberAddress, uint _roleId) public view returns(bool);   
}