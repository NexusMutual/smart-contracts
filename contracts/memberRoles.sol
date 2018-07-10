/* Copyright (C) 2017 NexusMutual.io
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
pragma solidity ^0.4.11;
import "./master.sol";
import "./SafeMaths.sol";


contract memberRoles {

    master ms;
    address masterAddress;

    bytes32[] memberRole;
    uint categorizeAuthRoleid;
    string memberRoleDescHash;
    bool public constructorCheck;

    struct memberRoleDetails {
        uint32 memberCounter;
        mapping(address => bool) memberActive;
        bool limitedValidity;
        mapping(address => uint) validity;
        address[] memberAddress;
    }

    mapping(uint => memberRoleDetails) memberRoleData;
    mapping(address => uint) memberAddressToMemberRole;
    mapping(uint => address) internal authorizedAddressAgainstRole;

    function memberRoles() {
        require(constructorCheck == false);
        memberRole.push("");
        memberRole.push("Advisory Board");
        memberRole.push("Token Holder");
        memberRole.push("Member");
        categorizeAuthRoleid = 1;
        constructorCheck = true;
    }

    /// @dev Change master's contract address
    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = master(masterAddress);
        } else {
            ms = master(masterAddress);
            require(ms.isInternal(msg.sender) == true);
            masterAddress = _add;
        }
    }

    modifier onlyInternal {

        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier onlyOwner {

        require(ms.isOwner(msg.sender) == true);
        _;
    }
    
    modifier checkRoleAuthority(uint _memberRoleId) {
        require(ms.isInternal(msg.sender) || msg.sender == authorizedAddressAgainstRole[_memberRoleId]);
        _;
    }

    function getRoleDescHash() constant returns(string) {
        return memberRoleDescHash;
    }

    /// @dev Get the role id assigned to a member when giving memberAddress
    function getMemberRoleIdByAddress(address _memberAddress) public constant returns(uint memberRoleId) {
        memberRoleId = memberAddressToMemberRole[_memberAddress];
    }

    /// @dev Get that member address assigned as a specific role when giving member role Id.
    function getMemberAddressByRoleId(uint _memberRoleId) public constant returns(uint roleId, address[] allMemberAddress) {
        return (_memberRoleId, memberRoleData[_memberRoleId].memberAddress);
    }

    function getAllMemberLength(uint _memberRoleId) public constant returns(uint, uint) {
        return (_memberRoleId, memberRoleData[_memberRoleId].memberAddress.length);
    }

    /// @dev Add new member role for governance.
    function addNewMemberRole(bytes32 _newRoleName, string _newDescHash) onlyOwner {
        memberRole.push(_newRoleName);
        memberRoleDescHash = _newDescHash;
    }

    /// @dev Get the role name whem giving role Id.
    function getMemberRoleNameById(uint _memberRoleId) public constant returns(uint roleId, bytes32 memberRoleName) {
        memberRoleName = memberRole[_memberRoleId];
        roleId = _memberRoleId;
    }

    function getRolesAndMember() constant returns(bytes32[] roleName, uint[] totalMembers) {
        roleName = new bytes32[](memberRole.length);
        totalMembers = new uint[](memberRole.length);
        for (uint i = 0; i < memberRole.length; i++) {
            bytes32 name;
            (, name) = getMemberRoleNameById(i);
            roleName[i] = name;
            (, totalMembers[i]) = getAllMemberLength(i);
        }
    }

    function updateMemberRole(
        address _memberAddress, 
        uint32 _roleId, 
        bool _typeOf,
        uint _validity
    ) 
        public 
        checkRoleAuthority(_roleId) 
    {
        if (_typeOf) {
            require(!memberRoleData[_roleId].memberActive[_memberAddress]);
            memberRoleData[_roleId].memberCounter = SafeMaths.add32(memberRoleData[_roleId].memberCounter, 1);
            memberRoleData[_roleId].memberActive[_memberAddress] = true;
            memberRoleData[_roleId].memberAddress.push(_memberAddress);
            memberRoleData[_roleId].validity[_memberAddress] = _validity;
        } else {
            require(memberRoleData[_roleId].memberActive[_memberAddress]);
            memberRoleData[_roleId].memberCounter = SafeMaths.sub32(memberRoleData[_roleId].memberCounter, 1);
            memberRoleData[_roleId].memberActive[_memberAddress] = false;
            memberRoleData[_roleId].validity[_memberAddress] = _validity;
        }
    }

    /// @dev Get the role id which is authorized to categorize a proposal.
    function getAuthorizedMemberId() public constant returns(uint roleId) {
        roleId = categorizeAuthRoleid;
    }

    /// @dev Change the role id that is authorized to categorize the proposal. (Only owner can do that)
    function changeAuthorizedMemberId(uint _roleId) public onlyOwner {
        categorizeAuthRoleid = _roleId;
    }

    /// @dev Get Total number of member Roles available.
    function getTotalMemberRoles() public constant returns(uint length) {
        return memberRole.length;
    }

    function isMember(address memAdd) constant returns(bool check) {
        check = false;
        if (memberRoleData[3].memberActive[memAdd] == true)
            check = true;
    }

    function getMemberActiveOrInactive(uint8 roleID, address memAdd) constant returns(uint8, bool) {
        return (roleID, memberRoleData[roleID].memberActive[memAdd]);
    }

    function getMemberActiveOrInactive(uint8 roleID) constant returns(uint8, uint) {
        return (roleID, memberRoleData[roleID].memberCounter);
    }
}