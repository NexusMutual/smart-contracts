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
import "./Governed.sol";


contract GovBlocksMaster {
    address public eventCaller;
    address public owner;
    address public gbtAddress;
    GovernChecker internal governChecker;

    struct GBDapps {
        address masterAddress;
        address tokenAddress;
        string dappDescHash;
    }

    mapping(address => bytes32) internal govBlocksDappByAddress;
    mapping(bytes32 => GBDapps) internal govBlocksDapps;
    mapping(address => string) internal govBlocksUser;
    bytes public masterByteCode;
    bytes32[] internal allGovBlocksUsers;
    string internal byteCodeHash;
    string internal contractsAbiHash;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /// @dev Initializes GovBlocks master
    /// @param _gbtAddress GBT standard token address
    function govBlocksMasterInit(address _gbtAddress, address _eventCaller) public {
        require(owner == address(0));
        owner = msg.sender;
        gbtAddress = _gbtAddress;
        eventCaller = _eventCaller;
        Governed govern = new Governed();
        governChecker = GovernChecker(govern.getGovernCheckerAddress());
        //   updateGBMAddress(address(this));  
    }

    /// @dev Transfers ownership to new owner (of GBT contract address)
    /// @param _newOwner Address of new owner
    function transferOwnership(address _newOwner) public onlyOwner {
        owner = _newOwner;
    }

    /// @dev Updates GBt standard token address
    /// @param _gbtContractAddress New GBT standard token contract address
    function updateGBTAddress(address _gbtContractAddress) public onlyOwner {
        gbtAddress = _gbtContractAddress;
        for (uint i = 0; i < allGovBlocksUsers.length; i++) {
            address masterAddress = govBlocksDapps[allGovBlocksUsers[i]].masterAddress;
            Master master = Master(masterAddress);
            if (master.versionLength() > 0)
                master.changeGBTSAddress(_gbtContractAddress);
        }
    }

    /// @dev Updates GovBlocks master address
    /// @param _newGBMAddress New GovBlocks master address
    function updateGBMAddress(address _newGBMAddress) public onlyOwner {
        for (uint i = 0; i < allGovBlocksUsers.length; i++) {
            address masterAddress = govBlocksDapps[allGovBlocksUsers[i]].masterAddress;
            Master master = Master(masterAddress);
            if (master.versionLength() > 0)
                master.changeGBMAddress(_newGBMAddress);
        }
        governChecker.updateGBMAdress(_newGBMAddress);
    }

    /// @dev Adds GovBlocks user
    /// @param _gbUserName dApp name
    /// @param _dappTokenAddress dApp token address
    /// @param _dappDescriptionHash dApp description hash having dApp or token logo information
    function addGovBlocksUser(bytes32 _gbUserName, address _dappTokenAddress, string _dappDescriptionHash) public {
        require(govBlocksDapps[_gbUserName].masterAddress == address(0));
        address _newMasterAddress = deployMaster(_gbUserName, masterByteCode);
        allGovBlocksUsers.push(_gbUserName);
        govBlocksDapps[_gbUserName].masterAddress = _newMasterAddress;
        govBlocksDapps[_gbUserName].tokenAddress = _dappTokenAddress;
        govBlocksDapps[_gbUserName].dappDescHash = _dappDescriptionHash;
        govBlocksDappByAddress[_newMasterAddress] = _gbUserName;
        govBlocksDappByAddress[_dappTokenAddress] = _gbUserName;
    }

    /// @dev Changes dApp master address
    /// @param _gbUserName dApp name
    /// @param _newMasterAddress dApp new master address
    function changeDappMasterAddress(bytes32 _gbUserName, address _newMasterAddress) public {
        if(address(governChecker) != address(0))          // Owner for debugging only, will be removed before launch
            require(msg.sender == governChecker.authorized(_gbUserName) || owner == msg.sender);
        else
            require(owner == msg.sender);
        govBlocksDapps[_gbUserName].masterAddress = _newMasterAddress;                   
        govBlocksDappByAddress[_newMasterAddress] = _gbUserName;
    }

    /// @dev Changes dApp token address
    /// @param _gbUserName  dApp name
    /// @param _dappTokenAddress dApp new token address
    function changeDappTokenAddress(bytes32 _gbUserName, address _dappTokenAddress) public {
        require(msg.sender == governChecker.authorized(_gbUserName) || owner == msg.sender); // Owner for debugging only
        govBlocksDapps[_gbUserName].tokenAddress = _dappTokenAddress;                        // will be removed before launch
        govBlocksDappByAddress[_dappTokenAddress] = _gbUserName;
    }

    /// @dev Sets byte code and abi hash that will help in generating new set of contracts for every dApp
    /// @param _byteCodeHash Byte code hash of all contracts    
    /// @param _abiHash Abi hash of all contracts
    function setByteCodeAndAbi(string _byteCodeHash, string _abiHash) public onlyOwner {
        byteCodeHash = _byteCodeHash;
        contractsAbiHash = _abiHash;
    }

    /// @dev Sets byte code of Master
    function setMasterByteCode(bytes _masterByteCode) public onlyOwner {
        masterByteCode = _masterByteCode;
    }

    /// @dev Sets dApp user information such as Email id, name etc.
    function setDappUser(string _hash) public {
        govBlocksUser[msg.sender] = _hash;
    }

    /// @dev Sets global event caller address
    function setEventCallerAddress(address _eventCaller) public onlyOwner {
        eventCaller = _eventCaller;
    }

    /// @dev Gets byte code and abi hash
    /// @param byteCode Byte code hash 
    /// @param abiHash Application binary interface hash
    function getByteCodeAndAbi() public view returns(string byteCode, string abiHash) {
        return (byteCodeHash, contractsAbiHash);
    }

    /// @dev Get Address of member that is authorized for a dApp.
    function getDappAuthorizedAddress(bytes32 _gbUserName) public view returns(address) {
        return governChecker.authorized(_gbUserName);
    }

    /// @dev Gets dApp details
    /// @param _gbUserName dApp name
    /// @return gbUserName dApp name
    /// @return masterContractAddress Master contract address of dApp
    /// @return allContractsbyteCodeHash All contracts byte code hash
    /// @return allCcontractsAbiHash All contracts abi hash
    /// @return versionNo Current Verson number of dApp
    function getGovBlocksUserDetails(bytes32 _gbUserName) 
        public 
        view 
        returns(
            bytes32 gbUserName, 
            address masterContractAddress, 
            string allContractsbyteCodeHash, 
            string allCcontractsAbiHash, 
            uint versionNo
        ) 
    {
        address masterAddress = govBlocksDapps[_gbUserName].masterAddress;
        if (masterAddress == address(0))
            return (_gbUserName, address(0), "", "", 0);
        Master master = Master(masterAddress);
        versionNo = master.versionLength();
        return (_gbUserName, govBlocksDapps[_gbUserName].masterAddress, byteCodeHash, contractsAbiHash, versionNo);
    }

    /// @dev Gets dApp details such as master contract address and dApp name
    function getGovBlocksUserDetailsByIndex(uint _index) 
        public 
        view 
        returns(uint index, bytes32 gbUserName, address masterContractAddress) 
    {
        return (_index, allGovBlocksUsers[_index], govBlocksDapps[allGovBlocksUsers[_index]].masterAddress);
    }

    /// @dev Gets dApp details (another function)
    /// @param _gbUserName dApp name whose details need to be fetched
    /// @return GbUserName dApp name 
    /// @return masterContractAddress Master contract address
    /// @return dappTokenAddress dApp token address
    /// @return allContractsbyteCodeHash All contracts byte code hash
    /// @return allCcontractsAbiHash All contract abi hash
    /// @return versionNo Version number
    function getGovBlocksUserDetails1(bytes32 _gbUserName) 
        public 
        view 
        returns(
            bytes32 gbUserName, 
            address masterContractAddress, 
            address dappTokenAddress, 
            string allContractsbyteCodeHash, 
            string allCcontractsAbiHash, 
            uint versionNo
        ) 
    {
        address masterAddress = govBlocksDapps[_gbUserName].masterAddress;
        if (masterAddress == address(0))
            return (_gbUserName, address(0), address(0), "", "", 0);
            
        Master master = Master(masterAddress);
        versionNo = master.versionLength();
        return (
            _gbUserName, 
            govBlocksDapps[_gbUserName].masterAddress, 
            govBlocksDapps[_gbUserName].tokenAddress, 
            byteCodeHash, 
            contractsAbiHash, 
            versionNo
        );
    }

    /// @dev Gets dApp details by passing either of contract address i.e. Token or Master contract address
    /// @param _address Contract address is passed
    /// @return dappName dApp name
    /// @return masterContractAddress Master contract address of dApp
    /// @return dappTokenAddress dApp's token address
    function getGovBlocksUserDetails2(address _address) 
        public 
        view 
        returns(bytes32 dappName, address masterContractAddress, address dappTokenAddress) 
    {
        dappName = govBlocksDappByAddress[_address];
        return (dappName, govBlocksDapps[dappName].masterAddress, govBlocksDapps[dappName].tokenAddress);
    }

    /// @dev Gets dApp description hash
    /// @param _gbUserName dApp name
    function getDappDescHash(bytes32 _gbUserName) public view returns(string) {
        return govBlocksDapps[_gbUserName].dappDescHash;
    }

    /// @dev Gets Total number of dApp that has been integrated with GovBlocks so far.
    function getAllDappLength() public view returns(uint) {
        return (allGovBlocksUsers.length);
    }

    /// @dev Gets dApps users by index
    function getAllDappById(uint _gbIndex) public view returns(bytes32 _gbUserName) {
        return (allGovBlocksUsers[_gbIndex]);
    }

    /// @dev Gets all dApps users
    function getAllDappArray() public view returns(bytes32[]) {
        return (allGovBlocksUsers);
    }

    /// @dev Gets dApp username
    function getDappUser() public view returns(string) {
        return (govBlocksUser[msg.sender]);
    }

    /// @dev Gets dApp master address of dApp (username=govBlocksUser)
    function getDappMasterAddress(bytes32 _gbUserName) public view returns(address masterAddress) {
        return (govBlocksDapps[_gbUserName].masterAddress);
    }

    /// @dev Gets dApp token address of dApp (username=govBlocksUser)
    function getDappTokenAddress(bytes32 _gbUserName) public view returns(address tokenAddres) {
        return (govBlocksDapps[_gbUserName].tokenAddress);
    }

    /// @dev Gets dApp username by address
    function getDappNameByAddress(address _contractAddress) public view returns(bytes32) {
        return govBlocksDappByAddress[_contractAddress];
    }

    /// @dev Gets GBT standard token address 
    function getGBTAddress() public view returns(address) {
        return gbtAddress;
    }

    /// @dev Deploys a new Master
    function deployMaster(bytes32 _gbUserName, bytes _masterByteCode) internal returns(address deployedAddress) {
        assembly {
          deployedAddress := create(0, add(_masterByteCode, 0x20), mload(_masterByteCode))  // deploys contract
        }
        Master master = Master(deployedAddress);
        master.initMaster(msg.sender, _gbUserName);
    }
}