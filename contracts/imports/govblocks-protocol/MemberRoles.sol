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
import "../openzeppelin-solidity/math/SafeMaths.sol";
import "../openzeppelin-solidity/token/ERC20/StandardToken.sol";
import "./Governed.sol";


contract MemberRoles is Governed {
    event MemberRole(uint256 indexed roleId, bytes32 roleName, string roleDescription, bool limitedValidity);
    using SafeMaths for uint;

    bytes32[] internal memberRole;
    StandardToken public dAppToken;
    address public firstAB;

    bool internal constructorCheck;
    bool internal adderCheck;

    struct MemberRoleDetails {
        uint memberCounter;
        mapping(address => bool) memberActive;
        bool limitedValidity;
        mapping(address => uint) validity;
        address[] memberAddress;
    }

    mapping(uint => address) internal authorizedAddressAgainstRole;
    mapping(uint => MemberRoleDetails) internal memberRoleData;

    modifier checkRoleAuthority(uint _memberRoleId) {
        if (authorizedAddressAgainstRole[_memberRoleId] != address(0))
            require(msg.sender == authorizedAddressAgainstRole[_memberRoleId]);
        else
            require(isAuthorizedToGovern(msg.sender));
        _;
    }

    function memberRolesInitiate(bytes32 _dAppName, address _dAppToken, address _firstAB) public {
        require(!constructorCheck);
        dappName = _dAppName;
        dAppToken = StandardToken(_dAppToken);
        firstAB = _firstAB;
        constructorCheck = true;
    }

    function addInitialMemberRoles() public {
        require(!adderCheck);
        memberRole.push("");
        emit MemberRole(0, "Everyone", "Professionals that are a part of the GBT network", false);
        memberRole.push("Advisory Board");
        emit MemberRole(
            1,
            "Advisory Board",
            "Selected few members that are deeply entrusted by the dApp. An ideal advisory board should be a mix of skills of domain, governance,research, technology, consulting etc to improve the performance of the dApp.", //solhint-disable-line
            false
        );
        memberRole.push("Token Holder");
        emit MemberRole(
            2,
            "Token Holder",
            "Represents all users who hold dApp tokens. This is the most general category and anyone holding token balance is a part of this category by default.", //solhint-disable-line
            false
        );
        memberRoleData[1].memberCounter++;
        memberRoleData[1].memberActive[firstAB] = true;
        memberRoleData[1].memberAddress.push(firstAB);
        adderCheck = true;
    }

    /// @dev To Initiate default settings whenever the contract is regenerated!
    function updateDependencyAddresses() public pure { //solhint-disable-line
    }

    /// @dev just to adhere to GovBlockss' Upgradeable interface
    function changeMasterAddress(address _masterAddress) public pure { //solhint-disable-line
    }

    /// @dev Get All role ids array that has been assigned to a member so far.
    function getRoleIdByAddress(address _memberAddress) public view returns(uint[] assignedRoles) {
        uint length = getRoleIdLengthByAddress(_memberAddress);
        uint j = 0;
        assignedRoles = new uint[](length);
        for (uint i = 1; i <= getTotalMemberRoles(); i++) {
            if (memberRoleData[i].memberActive[_memberAddress]
                && (!memberRoleData[i].limitedValidity || memberRoleData[i].validity[_memberAddress] > now) //solhint-disable-line
            ) {
                assignedRoles[j] = i;
                j++;
            }
        }
        if (dAppToken.balanceOf(_memberAddress) > 0) {
            assignedRoles[j] = 2;
        }

        return assignedRoles;
    }

    function getValidity(address _memberAddress, uint _roleId) public view returns (uint) {
        return memberRoleData[_roleId].validity[_memberAddress];
    }

    function getRoleValidity(uint _roleId) public view returns (bool) {
        return memberRoleData[_roleId].limitedValidity;
    }

    /// @dev Returns true if the given role id is assigned to a member.
    /// @param _memberAddress Address of member
    /// @param _roleId Checks member's authenticity with the roleId.
    /// i.e. Returns true if this roleId is assigned to member
    function checkRoleIdByAddress(address _memberAddress, uint _roleId) public view returns(bool) {
        if (_roleId == 0)
            return true;
        if (_roleId == 2) {
            if (dAppToken.balanceOf(_memberAddress) > 0)
                return true;
            else
                return false;
        }
        if (memberRoleData[_roleId].memberActive[_memberAddress]
            && (!memberRoleData[_roleId].limitedValidity || memberRoleData[_roleId].validity[_memberAddress] > now)) //solhint-disable-line
            return true;
        else
            return false;
    }

    /// @dev Assign or Delete a member from specific role.
    /// @param _memberAddress Address of Member
    /// @param _roleId RoleId to update
    /// @param _typeOf typeOf is set to be True if we want to assign this role to member, False otherwise!
    function updateMemberRole(
        address _memberAddress,
        uint _roleId,
        bool _typeOf,
        uint _validity
    )
        public
        checkRoleAuthority(_roleId)
    {
        if (_typeOf) {
            if (memberRoleData[_roleId].validity[_memberAddress] <= _validity) {
                if (!memberRoleData[_roleId].memberActive[_memberAddress]) {
                    memberRoleData[_roleId].memberCounter = SafeMaths.add(memberRoleData[_roleId].memberCounter, 1);
                    memberRoleData[_roleId].memberActive[_memberAddress] = true;
                    memberRoleData[_roleId].memberAddress.push(_memberAddress);
                    memberRoleData[_roleId].validity[_memberAddress] = _validity;
                } else {
                    memberRoleData[_roleId].validity[_memberAddress] = _validity;
                }
            }
        } else {
            require(memberRoleData[_roleId].memberActive[_memberAddress]);
            memberRoleData[_roleId].memberCounter = SafeMaths.sub(memberRoleData[_roleId].memberCounter, 1);
            delete memberRoleData[_roleId].memberActive[_memberAddress];
            delete memberRoleData[_roleId].validity[_memberAddress];
        }
    }

    /// @dev Updates Validity of a user
    function setValidityOfMember(address _memberAddress, uint _roleId, uint _validity)
        public
        checkRoleAuthority(_roleId)
    {
        memberRoleData[_roleId].validity[_memberAddress] = _validity;
    }

    /// @dev Update validity of role
    function setRoleValidity(uint _roleId, bool _validity) public checkRoleAuthority(_roleId) {
        memberRoleData[_roleId].limitedValidity = _validity;
    }

    /// @dev Change Member Address who holds the authority to Add/Delete any member from specific role.
    /// @param _roleId roleId to update its Authorized Address
    /// @param _newCanAddMember New authorized address against role id
    function changeCanAddMember(uint _roleId, address _newCanAddMember) public checkRoleAuthority(_roleId) {
        authorizedAddressAgainstRole[_roleId] = _newCanAddMember;
    }

    /// @dev Adds new member role
    /// @param _newRoleName New role name
    /// @param _roleDescription New description hash
    /// @param _canAddMembers Authorized member against every role id
    function addNewMemberRole(
        bytes32 _newRoleName, 
        string _roleDescription, 
        address _canAddMembers, 
        bool _limitedValidity
    )
        public
        onlyAuthorizedToGovern
    {
        uint rolelength = memberRole.length;
        memberRole.push(_newRoleName);
        authorizedAddressAgainstRole[rolelength] = _canAddMembers;
        memberRoleData[rolelength].limitedValidity = _limitedValidity;
        emit MemberRole(rolelength, _newRoleName, _roleDescription, _limitedValidity);
    }

    /// @dev Gets the member addresses assigned by a specific role
    /// @param _memberRoleId Member role id
    /// @return roleId Role id
    /// @return allMemberAddress Member addresses of specified role id
    function getAllAddressByRoleId(uint _memberRoleId) public view returns(uint, address[] allMemberAddress) {
        uint length = memberRoleData[_memberRoleId].memberAddress.length;
        uint j;
        uint i;
        address[] memory tempAllMemberAddress = new address[](memberRoleData[_memberRoleId].memberCounter);
        for (i = 0; i < length; i++) {
            address member = memberRoleData[_memberRoleId].memberAddress[i];
            if (memberRoleData[_memberRoleId].memberActive[member]
                && (!memberRoleData[_memberRoleId].limitedValidity 
                    || memberRoleData[_memberRoleId].validity[member] > now) //solhint-disable-line
            ) {
                tempAllMemberAddress[j] = member;
                j++;
            }
        }
        allMemberAddress = new address[](j);
        for (i = 0; i < j; i++) {
            allMemberAddress[i] = tempAllMemberAddress[i];
        }
        return (_memberRoleId, allMemberAddress);
    }

    /// @dev Gets all members' length
    /// @param _memberRoleId Member role id
    /// @return memberRoleData[_memberRoleId].memberAddress.length Member length
    function getAllMemberLength(uint _memberRoleId) public view returns(uint) {
        return memberRoleData[_memberRoleId].memberCounter;
    }

    /// @dev Return Member address at specific index against Role id.
    function getMemberAddressById(uint _memberRoleId, uint _index) public view returns(address) {
        return memberRoleData[_memberRoleId].memberAddress[_index];
    }

    /// @dev Return member address who holds the right to add/remove any member from specific role.
    function getAuthrizedMemberAgainstRole(uint _memberRoleId) public view returns(address) {
        return authorizedAddressAgainstRole[_memberRoleId];
    }

    /// @dev Gets the role name when given role id
    /// @param _memberRoleId Role id to get the Role name details
    /// @return  roleId Same role id
    /// @return memberRoleName Role name against that role id.
    function getMemberRoleNameById(uint _memberRoleId)
        public
        view
        returns(uint roleId, bytes32 memberRoleName)
    {
        memberRoleName = memberRole[_memberRoleId];
        roleId = _memberRoleId;
    }

    /// @dev Return total number of members assigned against each role id.
    /// @return roleName Role name array is returned
    /// @return totalMembers Total members in particular role id
    function getRolesAndMember() public view returns(bytes32[] roleName, uint[] totalMembers) {
        roleName = new bytes32[](memberRole.length);
        totalMembers = new uint[](memberRole.length);
        for (uint i = 0; i < memberRole.length; i++) {
            bytes32 name;
            (, name) = getMemberRoleNameById(i);
            roleName[i] = name;
            totalMembers[i] = getAllMemberLength(i);
        }
    }

    /// @dev Gets total number of member roles available
    function getTotalMemberRoles() public view returns(uint) {
        return memberRole.length;
    }

    /// @dev Get Total number of role ids that has been assigned to a member so far.
    function getRoleIdLengthByAddress(address _memberAddress) internal view returns(uint8 count) {
        uint length = getTotalMemberRoles();
        for (uint i = 1; i <= length; i++) {
            if (memberRoleData[i].memberActive[_memberAddress]
                && (!memberRoleData[i].limitedValidity || memberRoleData[i].validity[_memberAddress] > now)) //solhint-disable-line
                count++;       
        }
        if (dAppToken.balanceOf(_memberAddress) > 0)
            count++;
        return count;
    }
}