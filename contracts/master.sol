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
import "./claims.sol";
import "./claimsReward.sol";
import "./nxmToken2.sol";
import "./pool.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/govblocks-protocol/Governed.sol";


contract master is Governed {

    using SafeMaths
    for uint;

    struct changeVersion {
        uint dateImplement;
        uint versionNo;
    }

    struct emergencyPause {
        bool pause;
        uint time;
        bytes4 by;
    }

    emergencyPause[] emergencyPaused;

    uint public versionLength;
    bytes4[] contractNames;
    mapping(uint => mapping(bytes4 => Iupgradable)) public versionContractAddress;
    changeVersion[] public contractChangeDate;
    mapping(address => bool) public contractsActive;
    uint public currentVersion;
    address public memberRolesAddress;

    address masterAddress;

    claims c1;
    claimsReward cr;
    pool p1;
    MemberRoles mr;
    nxmToken2 tc2;

    address public owner;
    uint pauseTime;

    modifier onlyOwner {
        require(isOwner(msg.sender) == true);
        _;
    }

    modifier onlyInternal {
        require((contractsActive[msg.sender] == true || owner == msg.sender)); //&& emergencyPaused==0
        _;
    }

    modifier checkPause {
        require(isPause() == false);
        _;
    }

    /// @dev Constructor
    function master() {
        owner = msg.sender;
        contractsActive[address(this)] = true; //1
        masterAddress = address(this);
        versionLength = 0;
        pauseTime = SafeMaths.mul(28, 1 days); //4 weeks
        contractNames.push("QD");
        contractNames.push("TD");
        contractNames.push("CD");
        contractNames.push("PD");
        contractNames.push("MD");
        contractNames.push("Q2");
        contractNames.push("TOK1");
        contractNames.push("TOK2");
        contractNames.push("C1");
        contractNames.push("CR");
        contractNames.push("P1");
        contractNames.push("P2");
        contractNames.push("MAS2");
        contractNames.push("MCR");
        contractNames.push("P3");

    }

    /// @dev Changes the member roles contract address. The contract has been reused from GovBlocks
    /// and can be found in the imports folder
    /// The access modifier needs to be changed in onlyAuthorizedToGovern in future
    function changeMemberRolesAddress(address _memberRolesAddress) onlyInternal
    {
        memberRolesAddress = _memberRolesAddress;
        mr = MemberRoles(memberRolesAddress);
        tc2 = nxmToken2(versionContractAddress[currentVersion]["TOK2"]);
        tc2.changeMemberRolesAddress(_memberRolesAddress);
        
    }
    
    /// @dev Add Emergency pause
    /// @param _pause to set Emergency Pause ON/OFF
    /// @param _by to set who Start/Stop EP
    function addEmergencyPause(bool _pause, bytes4 _by) onlyAuthorizedToGovern {
        emergencyPaused.push(emergencyPause(_pause, now, _by));
        if (_pause == false) {
            c1 = claims(versionContractAddress[currentVersion]["C1"]);
            c1.submitClaimAfterEPOff(); //Submitting Requested Claims.
            c1.startAllPendingClaimsVoting(); //Start Voting of pending Claims again.
        }
    }

    ///@dev update time in seconds for which emergency pause is applied.
    function updatePauseTime(uint _time) onlyInternal {
        pauseTime = _time;
    }

    ///@dev get time in seconds for which emergency pause is applied.
    function getPauseTime() constant returns(uint _time) {
        return pauseTime;
    }

    /// @dev Updates master address of all associated contracts
    function changeMasterAddress(address _add) onlyOwner {
        Iupgradable contracts;
        for (uint i = 0; i < contractNames.length; i++) {
            contracts = Iupgradable(versionContractAddress[currentVersion][contractNames[i]]);
            contracts.changeMasterAddress(_add);
        }

    }

    /// @dev Updates the version of contracts, provides required addresses to all associated contracts
    /// calls the oraclize query to update UI.
    /// modifier to be changed to onlyAuthorizedToGovern in future.
    function switchToRecentVersion() onlyInternal {
        uint version = SafeMaths.sub(versionLength, 1);
        currentVersion = version;
        addInContractChangeDate(now, version);
        if (currentVersion > 0 && versionContractAddress[currentVersion]["CR"] != versionContractAddress[SafeMaths.sub(currentVersion, 1)]["CR"]) {
            cr = claimsReward(versionContractAddress[SafeMaths.sub(currentVersion, 1)]["CR"]);
            cr.upgrade(versionContractAddress[currentVersion]["CR"]);
        }
        addRemoveAddress(version);
        changeOtherAddress();
        if (currentVersion > 0) {
            p1 = pool(versionContractAddress[currentVersion]["P1"]);
            p1.versionOraclise(version);
        }
        
            
    }
        
    ///@dev checks whether the address is a latest contract address.
    function isInternal(address _add) constant returns(bool check) {
        check = false; // should be 0
        if ((contractsActive[_add] == true || owner == _add)) //remove owner for production release
            check = true;
    }

    /// @dev checks whether the address is the Owner or not.
    function isOwner(address _add) constant returns(bool check) {
        check = false;
        if (owner == _add)
            check = true;
    }

    /// @dev Checks whether emergency pause id on/not.
    function isPause() constant returns(bool check) {

        if (emergencyPaused.length > 0) {
            if (emergencyPaused[SafeMaths.sub(emergencyPaused.length, 1)].pause == true)
                return true;
            else
                return false;
        } else
            return false; //in emergency pause state
    }

    /// @dev checks whether the address is a member of the mutual or not.
    function isMember(address _add) constant returns(bool) {
        
        return mr.checkRoleIdByAddress(_add, 3);
    }

    ///@dev Changes owner of the contract.
    ///     In future, in most places onlyOwner to be replaced by onlyAuthorizedToGovern
    function changeOwner(address to) onlyOwner {
        if (owner == msg.sender)
            owner = to;
    }

    ///@dev Gets emergency pause details by index.
    function getEmergencyPauseByIndex(uint indx) constant returns(uint _indx, bool _pause, uint _time, bytes4 _by) {
        _pause = emergencyPaused[indx].pause;
        _time = emergencyPaused[indx].time;
        _by = emergencyPaused[indx].by;
        _indx = indx;
    }

    ///@dev Gets the number of emergency pause has been toggled.
    function getEmergencyPausedLength() constant returns(uint len) {
        len = emergencyPaused.length;
    }

    ///@dev Gets last emergency pause details.
    function getLastEmergencyPause() constant returns(bool _pause, uint _time, bytes4 _by) {
        _pause = false;
        _time = 0;
        _by = "";
        uint len = getEmergencyPausedLength();
        if (len > 0) {
            _pause = emergencyPaused[SafeMaths.sub(len, 1)].pause;
            _time = emergencyPaused[SafeMaths.sub(len, 1)].time;
            _by = emergencyPaused[SafeMaths.sub(len, 1)].by;
        }
    }

    /// @dev Creates a new version of contract addresses
    /// @param arr Array of addresses of compiled contracts.
    /// Adding a new version doesn't activate it. One needs to call switchToRecentVersion.
    function addNewVersion(Iupgradable[] arr) onlyOwner {
        uint versionNo = versionLength;
        setVersionLength(SafeMaths.add(versionNo, 1));
        for (uint i = 0; i < contractNames.length; i++) {
            versionContractAddress[versionNo][contractNames[i]] = arr[i];
        }
        
    }
    
    /// @dev Allow AB Members to Start Emergency Pause
    function startEmergencyPause() onlyAuthorizedToGovern {
        
        addEmergencyPause(true, "AB"); //Start Emergency Pause
        p1.closeEmergencyPause(getPauseTime()); //oraclize callback of 4 weeks
        c1.pauseAllPendingClaimsVoting(); //Pause Voting of all pending Claims
        
    }

    /// @dev Stores the date when version of contracts get switched.
    /// @param _date Current date stamp.
    /// @param vno Active version number to which contracts have been switched.
    function addInContractChangeDate(uint _date, uint vno) internal {
        contractChangeDate.push(changeVersion(_date, vno));
    }

    /// @dev Deactivates address of a contract from last version.
    // Sets value 0 for last version of contract address signifying that contract of last version is no longer active.
    // Sets value 1 signifying that contract of recent version is active.
    /// @param version Recent version number.
    function addRemoveAddress(uint version) internal {
        for (uint i = 0; i < contractNames.length; i++) {
            uint versionOld = 0;
            if (version > 0)
                versionOld = SafeMaths.sub(version, 1);
            contractsActive[versionContractAddress[versionOld][contractNames[i]]] = false;
            contractsActive[versionContractAddress[version][contractNames[i]]] = true;
        }
    }

    /// @dev Sets the length of version.
    function setVersionLength(uint len) internal {
        versionLength = len;
    }
    
    /// @dev Links internal contracts to one another.
    function changeOtherAddress() internal {
        Iupgradable contracts;
        for (uint i = 0; i < contractNames.length; i++) {
            contracts = Iupgradable(versionContractAddress[currentVersion][contractNames[i]]);
            contracts.changeDependentContractAddress();
        }

    }

}