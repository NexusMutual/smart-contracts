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

pragma solidity 0.4.24;

import "./TokenFunctions.sol";
import "./Claims.sol";
import "./ClaimsReward.sol";
import "./Pool1.sol";
import "./Pool2.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";
import "./imports/govblocks-protocol/Governed.sol";
import "./MemberRoles.sol";
import "./imports/proxy/OwnedUpgradeabilityProxy.sol";


contract NXMaster is Governed {
    using SafeMath for uint;

    struct EmergencyPause {
        bool pause;
        uint time;
        bytes4 by;
    }

    EmergencyPause[] public emergencyPaused;

    uint[] public versionDates;
    bytes2[] internal allContractNames;
    mapping(address => bool) public contractsActive;
    mapping(uint => mapping(bytes2 => address)) internal allContractVersions;

    address public tokenAddress;
    address public eventCallerAdd;

    Claims internal c1;
    ClaimsReward internal cr;
    TokenFunctions internal tf;
    Iupgradable internal up;

    address public owner;
    uint public pauseTime;

    modifier onlyOwner {
        require(isOwner(msg.sender) == true);
        _;
    }

    modifier onlyInternal {
        require((contractsActive[msg.sender] == true || owner == msg.sender));
        _;
    }

    constructor() public {
        owner = msg.sender;
        masterAddress = address(this);
        contractsActive[address(this)] = true; //1
        pauseTime = 28 days; //4 weeks
        contractsActive[address(this)] = true;
        versionDates.push(now); //solhint-disable-line
        addContractNames();
    }

    /// @dev upgrades a single contract
    function upgradeContractImplementation(bytes2 _contractsName, address _contractsAddress) 
        external onlyOwner 
    {
        require(_contractsName == "GV" || _contractsName == "MR" || _contractsName == "PC");
        _replaceImplementation(_contractsName, _contractsAddress);
    }

    /// @dev Add Emergency pause
    /// @param _pause to set Emergency Pause ON/OFF
    /// @param _by to set who Start/Stop EP
    function addEmergencyPause(bool _pause, bytes4 _by) public {
        require(msg.sender == getLatestAddress("P2") || msg.sender == getLatestAddress("GV"));
        emergencyPaused.push(EmergencyPause(_pause, now, _by));
        if (_pause == false) {
            c1 = Claims(allContractVersions[versionDates.length - 1]["CL"]);
            c1.submitClaimAfterEPOff(); //Submitting Requested Claims.
            c1.startAllPendingClaimsVoting(); //Start Voting of pending Claims again.
        }
    }

    ///@dev update time in seconds for which emergency pause is applied.
    function updatePauseTime(uint _time) public onlyInternal {
        pauseTime = _time;
    }

    ///@dev get time in seconds for which emergency pause is applied.
    function getPauseTime() public view returns(uint _time) {
        return pauseTime;
    }

    /// @dev Changes the NXMToken address.
    /// and can be found in the imports folder
    /// The access modifier needs to be changed in onlyAuthorizedToGovern in future
    function changeTokenAddress(address _newTokenAddress) public onlyOwner {
        tokenAddress = _newTokenAddress;
    }

    /// @dev upgrades a single contract
    function upgradeContract(bytes2 _contractsName, address _contractsAddress) public onlyOwner {
        allContractVersions[versionDates.length - 1][_contractsName] = _contractsAddress;
        changeMasterAddress(address(this));
        changeAllAddress();
    }

    /// @dev checks whether the address is a latest contract address.
    function isInternal(address _add) public view returns(bool check) {
        check = false; // should be 0
        if ((contractsActive[_add] == true || owner == _add)) //remove owner for production release
            check = true;
    }

    /// @dev checks whether the address is the Owner or not.
    function isOwner(address _add) public view returns(bool check) {
        return check = owner == _add;
    }

    /// @dev Checks whether emergency pause id on/not.
    function isPause() public view returns(bool check) {
        check = false;
        if (emergencyPaused.length > 0) {
            if (emergencyPaused[emergencyPaused.length.sub(1)].pause == true)
                check = true;
        } 
    }

    /// @dev checks whether the address is a member of the mutual or not.
    function isMember(address _add) public view returns(bool) {
        MemberRoles mr = MemberRoles(getLatestAddress("MR"));
        return mr.checkRole(_add, uint(MemberRoles.Role.Member));
    }

    ///@dev Changes owner of the contract.
    ///     In future, in most places onlyOwner to be replaced by onlyAuthorizedToGovern
    function changeOwner(address to) public onlyOwner {
        owner = to;
    }

    function getEventCallerAddress() public view returns(address) {
        return eventCallerAdd;
    }

    ///@dev Gets emergency pause details by index.
    function getEmergencyPauseByIndex(
        uint index
    )   
        public
        view
        returns(
            uint _index,
            bool _pause,
            uint _time,
            bytes4 _by
        )
    {
        _pause = emergencyPaused[index].pause;
        _time = emergencyPaused[index].time;
        _by = emergencyPaused[index].by;
        _index = index;
    }

    ///@dev Gets the number of emergency pause has been toggled.
    function getEmergencyPausedLength() public view returns(uint len) {
        len = emergencyPaused.length;
    }

    ///@dev Gets last emergency pause details.
    function getLastEmergencyPause() public view returns(bool _pause, uint _time, bytes4 _by) {
        _pause = false;
        _time = 0;
        _by = "";
        uint len = getEmergencyPausedLength();
        if (len > 0) {
            len = len.sub(1);
            _pause = emergencyPaused[len].pause;
            _time = emergencyPaused[len].time;
            _by = emergencyPaused[len].by;
        }
    }

    /// @dev Changes Master contract address
    function changeMasterAddress(address _masterAddress) public {
        if (_masterAddress != address(this)) {
            require(msg.sender == owner, "Neither master nor owner");
        }
        
        for (uint i = 0; i < allContractNames.length; i++) {
            if ((versionDates.length == 2) || !(allContractNames[i] == "MR" || 
                allContractNames[i] == "GV" || allContractNames[i] == "PC")) {
                up = Iupgradable(allContractVersions[versionDates.length - 1][allContractNames[i]]);
                up.changeMasterAddress(_masterAddress);
            }
            
        }
        
        contractsActive[address(this)] = false;
        contractsActive[_masterAddress] = true;
       
    }

    function setEventCallerAddress(address _add) public onlyOwner {
        eventCallerAdd = _add;
    }

    /// @dev Gets current version amd its master address
    /// @return versionNo Current version number that is active
    function getCurrentVersion() public view returns(uint versionNo) {
        return versionDates.length - 1;
    }

    /// @dev Gets latest version name and address
    /// @param _versionNo Version number that data we want to fetch
    /// @return versionNo Version number
    /// @return contractsName Latest version's contract names
    /// @return contractsAddress Latest version's contract addresses
    function getVersionData(
        uint _versionNo
    ) 
        public 
        view 
        returns (
            uint versionNo,
            bytes2[] contractsName,
            address[] contractsAddress
        ) 
    {
        versionNo = _versionNo;
        contractsName = new bytes2[](allContractNames.length);
        contractsAddress = new address[](allContractNames.length);

        for (uint i = 0; i < allContractNames.length; i++) {
            contractsName[i] = allContractNames[i];
            contractsAddress[i] = allContractVersions[versionNo][allContractNames[i]];
        }
    }

    function dAppLocker() public view returns(address _add) {

        _add = getLatestAddress("TC");

    }

    function dAppToken() public view returns(address _add) {
        _add = tokenAddress;
    }

    /// @dev Gets latest contract address
    /// @param _contractName Contract name to fetch
    function getLatestAddress(bytes2 _contractName) public view returns(address contractAddress) {
        contractAddress =
            allContractVersions[versionDates.length - 1][_contractName];
    }

    /// @dev Gets latest contract address
    /// @param _contractName Contract name to fetch
    function contractAddress(bytes2 _contractName) public view returns(address _contractAddress) {
        if (_contractName == "TK")
            _contractAddress = tokenAddress;
        else
            _contractAddress =
                allContractVersions[versionDates.length - 1][_contractName];
    }

    /// @dev Creates a new version of contract addresses
    /// @param _contractAddresses Array of contract addresses which will be generated
    function addNewVersion(address[] _contractAddresses) public onlyOwner {

        MemberRoles mr = MemberRoles(_contractAddresses[14]);
        bool newMasterCheck = mr.nxMasterAddress() != address(0);

        for (uint i = 0; i < allContractNames.length; i++) {
            if ((allContractNames[i] == "MR" || allContractNames[i] == "GV" || 
                allContractNames[i] == "PC") && versionDates.length == 1) {
                if (newMasterCheck)
                    allContractVersions[versionDates.length][allContractNames[i]] = _contractAddresses[i];
                else
                    _generateProxy(allContractNames[i], _contractAddresses[i]);
            } else if (!(allContractNames[i] == "MR" || allContractNames[i] == "GV" || allContractNames[i] == "PC")) {
                allContractVersions[versionDates.length][allContractNames[i]] = _contractAddresses[i];
            } else {
                allContractVersions[versionDates.length][allContractNames[i]] = 
                allContractVersions[versionDates.length - 1][allContractNames[i]];
            }

        }

            
        versionDates.push(now); //solhint-disable-line
        
            
        changeMasterAddress(address(this));
        changeAllAddress();

        
    }

    /// @dev transfers proxy ownership to new master.
    /// @param _contractAddress contract address of new master.
    /// @param _proxyContracts array of addresses of proxyContracts
    function changeProxyOwnership(address _contractAddress, address[] _proxyContracts) public onlyOwner {
        for (uint i = 0; i < _proxyContracts.length; i++) {
            OwnedUpgradeabilityProxy tempInstance 
            = OwnedUpgradeabilityProxy(_proxyContracts[i]);
            tempInstance.transferProxyOwnership(_contractAddress); 
        }
        
        
    }

    function checkIsAuthToGoverned(address _add) public view returns(bool) {
        return isAuthorizedToGovern(_add);
    }

    /// @dev Allow AB Members to Start Emergency Pause
    function startEmergencyPause() public  onlyAuthorizedToGovern {
        addEmergencyPause(true, "AB"); //Start Emergency Pause
        Pool1 p1 = Pool1(allContractVersions[versionDates.length - 1]["P1"]);
        p1.closeEmergencyPause(getPauseTime()); //oraclize callback of 4 weeks
        c1 = Claims(allContractVersions[versionDates.length - 1]["CL"]);
        c1.pauseAllPendingClaimsVoting(); //Pause Voting of all pending Claims
    }

    function _replaceImplementation(bytes2 _contractsName, address _contractsAddress) internal {
        uint currentVersion = versionDates.length - 1;
        OwnedUpgradeabilityProxy tempInstance 
            = OwnedUpgradeabilityProxy(allContractVersions[currentVersion][_contractsName]);
        tempInstance.upgradeTo(_contractsAddress);
    }

    function _generateProxy(bytes2 _contractName, address _contractAddress) internal {
        uint currentVersion = versionDates.length;
        OwnedUpgradeabilityProxy tempInstance = new OwnedUpgradeabilityProxy(_contractAddress);
        allContractVersions[currentVersion][_contractName] = address(tempInstance);
        contractsActive[address(tempInstance)] = true;
        if (_contractName == "MR") {
            MemberRoles mr = MemberRoles(address(tempInstance));
            mr.memberRolesInitiate(allContractVersions[currentVersion]["TC"], 
                owner, allContractVersions[currentVersion]["TF"]);
        }
    }

    /// @dev Save the initials of all the contracts
    function addContractNames() internal {
        allContractNames.push("QD");
        allContractNames.push("TD");
        allContractNames.push("CD");
        allContractNames.push("PD");
        allContractNames.push("QT");
        allContractNames.push("TF");
        allContractNames.push("TC");
        allContractNames.push("CL");
        allContractNames.push("CR");
        allContractNames.push("P1");
        allContractNames.push("P2");
        allContractNames.push("MC");
        allContractNames.push("GV");
        allContractNames.push("PC");
        allContractNames.push("MR");
    }

    /// @dev Sets the older versions of contract addresses as inactive and the latest one as active.
    function changeAllAddress() internal {
        uint i;
        uint currentVersion = versionDates.length - 1;
        Pool1 p1;
        Pool2 p2;

        if (versionDates.length < 3) {
            for (i = 0; i < allContractNames.length; i++) {
                if ((versionDates.length == 2) || !(allContractNames[i] == "MR" || 
                    allContractNames[i] == "GV" || allContractNames[i] == "PC")) {
                    contractsActive[allContractVersions[currentVersion][allContractNames[i]]] = true;
                    up = Iupgradable(allContractVersions[currentVersion][allContractNames[i]]);
                    up.changeDependentContractAddress();
                }
            }
        } else {
            for (i = 0; i < allContractNames.length; i++) {
                if ((versionDates.length == 2) || !(allContractNames[i] == "MR" || 
                    allContractNames[i] == "GV" || allContractNames[i] == "PC")) {
                    contractsActive[allContractVersions[currentVersion - 1][allContractNames[i]]] = false;
                    contractsActive[allContractVersions[currentVersion][allContractNames[i]]] = true;
                    up = Iupgradable(allContractVersions[currentVersion][allContractNames[i]]);
                    up.changeDependentContractAddress();
                }
            }

            if (allContractVersions[currentVersion]["CR"] != allContractVersions[currentVersion - 1]["CR"] 
                && allContractVersions[currentVersion]["TD"] == allContractVersions[currentVersion - 1]["TD"]) {
                cr = ClaimsReward(allContractVersions[currentVersion - 1]["CR"]);
                cr.upgrade(allContractVersions[currentVersion]["CR"]);
            }

            if (allContractVersions[currentVersion]["P1"] != allContractVersions[currentVersion - 1]["P1"]) {
                p1 = Pool1(allContractVersions[currentVersion - 1]["P1"]);
                p1.upgradeCapitalPool(allContractVersions[currentVersion]["P1"]);
            }

            if (allContractVersions[currentVersion]["P2"] != allContractVersions[currentVersion - 1]["P2"]) {
                p2 = Pool2(allContractVersions[currentVersion - 1]["P2"]);
                p2.upgradeInvestmentPool(allContractVersions[currentVersion]["P2"]);
            }

            p1 = Pool1(allContractVersions[currentVersion]["P1"]);
            p1.versionOraclise(currentVersion);
        }
    }
}