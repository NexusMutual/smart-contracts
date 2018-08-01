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

pragma solidity ^0.4.24;
import "./Master.sol";
import "./SafeMath.sol";
import "./Upgradeable.sol";


contract MemberRoles is Upgradeable {
    event MemberRole(uint256 indexed roleId, bytes32 roleName, string roleDescription, bool limitedValidity);
    using SafeMath for uint;
    bytes32[] internal memberRole;
    uint8 internal authorizedAddressToCategorize;
    bool public constructorCheck;
    address public masterAddress;
    Master internal master;
    uint constant UINT_MAX = uint256(0) - uint256(1);
    address simpleVoting;

    struct MemberRoleDetails {
        uint32 memberCounter;
        mapping(address => bool) memberActive;
        bool limitedValidity;
        mapping(address => uint) validity;
        address[] memberAddress;
    }

    mapping(uint => address) internal authorizedAddressAgainstRole;
    mapping(uint => MemberRoleDetails) internal memberRoleData;

    /// @dev Initiates Default settings for Member Roles contract
    function memberRolesInitiate() public {
        require(!constructorCheck);
        uint rolelength = getTotalMemberRoles();
        memberRole.push("");
        authorizedAddressAgainstRole[rolelength] = address(0);
        emit MemberRole(rolelength, "", "", false);
        rolelength++;
        memberRole.push("Advisory Board");
        authorizedAddressAgainstRole[rolelength] = master.owner();
        emit MemberRole(
            rolelength, 
            "Advisory Board", 
            "Selected few members that are deeply entrusted by the dApp. An ideal advisory board should be a mix of skills of domain, governance,research, technology, consulting etc to improve the performance of the dApp.",
            false
        );
        rolelength++;
        memberRole.push("Token Holder");
        authorizedAddressAgainstRole[rolelength] = address(0);
        emit MemberRole(
            rolelength, 
            "Token Holder", 
            "Represents all users who hold dApp tokens. This is the most general category and anyone holding token balance is a part of this category by default.",
            false
        );
        setOwnerRole();
        authorizedAddressToCategorize = 1;
        constructorCheck = true;
    }

    modifier onlyInternal {
        master = Master(masterAddress);
        require(master.isInternal(msg.sender));
        _;
    }

    modifier onlyOwner {
        master = Master(masterAddress);
        require(master.isOwner(msg.sender));
        _;
    }

    modifier checkRoleAuthority(uint _memberRoleId) {
        master = Master(masterAddress);
        require(msg.sender == authorizedAddressAgainstRole[_memberRoleId] || master.isOwner(msg.sender));
        _;
    }

    modifier onlySV {
        master = Master(masterAddress);
        require(
            master.getLatestAddress("SV") == msg.sender 
            || master.isInternal(msg.sender) 
            || master.isOwner(msg.sender)
        );
        _;
    }

    /// @dev Returns true if the caller address is Master's contract address
    function isMaster() public view returns(bool) {
        if (msg.sender == masterAddress)
            return true;
    }

    /// @dev Changes Master's contract address 
    /// @param _masterContractAddress New master address
    function changeMasterAddress(address _masterContractAddress) public {
        if (masterAddress == address(0))
            masterAddress = _masterContractAddress;
        else {
            master = Master(masterAddress);
            require(master.isInternal(msg.sender));
            masterAddress = _masterContractAddress;
        }
    }

    /// @dev just to adhere to the interface
    function changeGBTSAddress(address) public {
    }

    /// @dev To Initiate default settings whenever the contract is regenerated!
    function updateDependencyAddresses() public {
        if (!constructorCheck)
            memberRolesInitiate();
        master = Master(masterAddress);
        address newSV = master.getLatestAddress("SV");
        if (simpleVoting != newSV) {
            for (uint i = 0; i < memberRole.length; i++) {
                if (authorizedAddressAgainstRole[i] == simpleVoting)
                    authorizedAddressAgainstRole[i] = newSV;
            }
            simpleVoting = newSV;
        }
    }

    /// @dev Get All role ids array that has been assigned to a member so far.
    function getRoleIdByAddress(address _memberAddress) public view returns(uint32[] assignedRoles) {
        uint8 length = getRoleIdLengthByAddress(_memberAddress);
        uint8 j = 0;
        assignedRoles = new uint32[](length);
        for (uint8 i = 0; i < getTotalMemberRoles(); i++) {
            if (memberRoleData[i].memberActive[_memberAddress] 
                && (!memberRoleData[i].limitedValidity || memberRoleData[i].validity[_memberAddress] > now)
            ) {
                assignedRoles[j] = i;
                j++;
            }
        }
        return assignedRoles;
    }

    function getValidity(address _memberAddress, uint32 _roleId) public view returns (uint) {
        return memberRoleData[_roleId].validity[_memberAddress];
    }

    /// @dev Returns true if the given role id is assigned to a member.
    /// @param _memberAddress Address of member
    /// @param _roleId Checks member's authenticity with the roleId. 
    /// i.e. Returns true if this roleId is assigned to member
    function checkRoleIdByAddress(address _memberAddress, uint32 _roleId) external view returns(bool) {
        if (memberRoleData[_roleId].memberActive[_memberAddress] 
            && (!memberRoleData[_roleId].limitedValidity || memberRoleData[_roleId].validity[_memberAddress] > now))
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
        uint32 _roleId, 
        bool _typeOf,
        uint _validity
    ) 
        public 
        checkRoleAuthority(_roleId) 
    {
        if (_typeOf) {
            if(memberRoleData[_roleId].validity[_memberAddress] < now) {
                if(!memberRoleData[_roleId].memberActive[_memberAddress]) {
                    memberRoleData[_roleId].memberCounter = SafeMath.add32(memberRoleData[_roleId].memberCounter, 1);
                    memberRoleData[_roleId].memberActive[_memberAddress] = true;
                    memberRoleData[_roleId].memberAddress.push(_memberAddress);
                    memberRoleData[_roleId].validity[_memberAddress] = _validity;
                } else {
                    memberRoleData[_roleId].validity[_memberAddress] = _validity;
                }     
            }  
        } else {
            require(memberRoleData[_roleId].memberActive[_memberAddress]);
            memberRoleData[_roleId].memberCounter = SafeMath.sub32(memberRoleData[_roleId].memberCounter, 1);
            memberRoleData[_roleId].memberActive[_memberAddress] = false;
        }
    }

    /// @dev Updates Validity of a user
    function setValidityOfMember(address _memberAddress, uint32 _roleId, uint _validity) 
        public 
        checkRoleAuthority(_roleId) 
    {
        memberRoleData[_roleId].validity[_memberAddress] = _validity;
    }

    /// @dev Update validity of role
    function setRoleValidity(uint32 _roleId, bool _validity) public checkRoleAuthority(_roleId) {
        memberRoleData[_roleId].limitedValidity = _validity;
    }

    /// @dev Change Member Address who holds the authority to Add/Delete any member from specific role.
    /// @param _roleId roleId to update its Authorized Address
    /// @param _newCanAddMember New authorized address against role id
    function changeCanAddMember(uint32 _roleId, address _newCanAddMember) public {
        if (authorizedAddressAgainstRole[_roleId] == address(0))
            authorizedAddressAgainstRole[_roleId] = _newCanAddMember;
        else {
            require(msg.sender == authorizedAddressAgainstRole[_roleId]);
            authorizedAddressAgainstRole[_roleId] = _newCanAddMember;
        }
    }

    /// @dev Changes the role id of the member who is authorized to categorize the proposal
    /// @param _roleId Role id of that member
    function changeAuthorizedMemberId(uint8 _roleId) public onlyOwner {
        authorizedAddressToCategorize = _roleId;
    }

    /// @dev Adds new member role
    /// @param _newRoleName New role name
    /// @param _roleDescription New description hash
    /// @param _canAddMembers Authorized member against every role id
    function addNewMemberRole(bytes32 _newRoleName, string _roleDescription, address _canAddMembers, bool _limitedValidity) 
        public 
        onlySV 
    {
        uint rolelength = getTotalMemberRoles();
        memberRole.push(_newRoleName);
        if (_canAddMembers == address(0)) {
            master = Master(masterAddress);
            authorizedAddressAgainstRole[rolelength] = master.getLatestAddress("SV");
        } else {
            authorizedAddressAgainstRole[rolelength] = _canAddMembers;
        }
        memberRoleData[rolelength].limitedValidity = _limitedValidity;
        emit MemberRole(rolelength, _newRoleName, _roleDescription, _limitedValidity);
    }

    /// @dev Gets the member addresses assigned by a specific role
    /// @param _memberRoleId Member role id
    /// @return roleId Role id
    /// @return allMemberAddress Member addresses of specified role id
    function getAllAddressByRoleId(uint32 _memberRoleId) public view returns(uint32, address[] allMemberAddress) {
        uint length = memberRoleData[_memberRoleId].memberAddress.length;
        uint64 j;
        uint64 i;
        address[] memory tempAllMemberAddress = new address[](memberRoleData[_memberRoleId].memberCounter);
        for (i = 0; i < length; i++) {
            address member = memberRoleData[_memberRoleId].memberAddress[i];
            if (memberRoleData[_memberRoleId].memberActive[member]
                && (!memberRoleData[_memberRoleId].limitedValidity || memberRoleData[_memberRoleId].validity[member] > now)
            ) {
                tempAllMemberAddress[j] = member;
                j++;
            }
        }
        allMemberAddress = new address[](j);
        for(i = 0; i < j; i++) {
            allMemberAddress[i] = tempAllMemberAddress[i];
        }
        return (_memberRoleId, allMemberAddress);
    }

    /// @dev Gets all members' length
    /// @param _memberRoleId Member role id
    /// @return memberRoleData[_memberRoleId].memberAddress.length Member length
    function getAllMemberLength(uint32 _memberRoleId) public view returns(uint) {
        return memberRoleData[_memberRoleId].memberCounter;
    }

    /// @dev Return Member address at specific index against Role id.
    function getAllMemberAddressById(uint32 _memberRoleId, uint _index) public view returns(address) {
        return memberRoleData[_memberRoleId].memberAddress[_index];
    }

    /// @dev Return member address who holds the right to add/remove any member from specific role.
    function getAuthrizedMemberAgainstRole(uint32 _memberRoleId) public view returns(address) {
        return authorizedAddressAgainstRole[_memberRoleId];
    }

    /// @dev Gets the role name when given role id
    /// @param _memberRoleId Role id to get the Role name details
    /// @return  roleId Same role id
    /// @return memberRoleName Role name against that role id.
    function getMemberRoleNameById(uint32 _memberRoleId) 
        public 
        view 
        returns(uint32 roleId, bytes32 memberRoleName) 
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
        for (uint32 i = 0; i < memberRole.length; i++) {
            bytes32 name;
            (, name) = getMemberRoleNameById(i);
            roleName[i] = name;
            totalMembers[i] = getAllMemberLength(i);
        }
    }

    /// @dev Gets the role id which is authorized to categorize a proposal
    function getAuthorizedMemberId() public view returns(uint8 roleId) {
        roleId = authorizedAddressToCategorize;
    }

    /// @dev Gets total number of member roles available
    function getTotalMemberRoles() public view returns(uint) {
        return memberRole.length;
    }

    /// @dev Add dApp Owner in Advisory Board Members.
    function setOwnerRole() internal {
        master = Master(masterAddress);
        address ownAddress = master.owner();
        memberRoleData[1].memberCounter = SafeMath.add32(memberRoleData[1].memberCounter, 1);
        memberRoleData[1].memberActive[ownAddress] = true;
        memberRoleData[1].memberAddress.push(ownAddress);
        memberRoleData[1].validity[ownAddress] = UINT_MAX;
    }

    /// @dev Get Total number of role ids that has been assigned to a member so far.
    function getRoleIdLengthByAddress(address _memberAddress) internal view returns(uint8 count) {
        uint length = getTotalMemberRoles();
        for (uint8 i = 0; i < length; i++) {
            if (memberRoleData[i].memberActive[_memberAddress] 
                && (!memberRoleData[i].limitedValidity || memberRoleData[i].validity[_memberAddress] > now))
                count++;
        }
        return count;
    }
}
