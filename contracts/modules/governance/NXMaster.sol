// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IMasterAwareV2.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ILegacyClaimsReward.sol";

contract NXMaster is INXMMaster {

  address public _unusedM;
  uint public _unused0;

  bytes2[] public contractCodes;
  mapping(address => bool) public contractsActive;
  mapping(bytes2 => address payable) public contractAddresses;
  mapping(bytes2 => bool) public isProxy;
  mapping(bytes2 => bool) public isReplaceable;

  address public tokenAddress;
  bool internal reentrancyLock;
  bool public masterInitialized;
  address public owner;
  uint public _unused1;

  address public emergencyAdmin;
  bool public paused;

  enum ContractType { Undefined, Replaceable, Proxy }

  event InternalContractAdded(bytes2 indexed code, address contractAddress, ContractType indexed contractType);
  event ContractUpgraded(bytes2 indexed code, address newAddress, address previousAddress, ContractType indexed contractType);
  event ContractRemoved(bytes2 indexed code, address contractAddress);
  event PauseConfigured(bool paused);

  modifier onlyGovernance() {
    require(getLatestAddress("GV") == msg.sender, "Not authorized");
    _;
  }

  modifier noReentrancy() {
    require(!reentrancyLock, "Reentrant call.");
    reentrancyLock = true;
    _;
    reentrancyLock = false;
  }

  modifier onlyEmergencyAdmin() {
    require(msg.sender == emergencyAdmin, "NXMaster: Not emergencyAdmin");
    _;
  }

  function initializeEmergencyAdmin() external {
    if (emergencyAdmin == address(0)) {
      emergencyAdmin = 0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D;
    }
  }

  /**
   * @dev set Emergency pause
   * @param _paused to toggle emergency pause ON/OFF
   */
  function setEmergencyPause(bool _paused) public onlyEmergencyAdmin {
    paused = _paused;
    emit PauseConfigured(_paused);
  }

  function isInternal(address _contractAddress) public view returns (bool) {
    return contractsActive[_contractAddress];
  }

  function isPause() public view returns (bool) {
    return paused;
  }

  function isMember(address _add) public view returns (bool) {
    IMemberRoles mr = IMemberRoles(getLatestAddress("MR"));
    return mr.checkRole(_add, uint(IMemberRoles.Role.Member));
  }

  function getInternalContracts() public view returns (
    bytes2[] memory _contractCodes,
    address[] memory _contractAddresses
  ) {
    _contractCodes = contractCodes;
    _contractAddresses = new address[](contractCodes.length);

    for (uint i = 0; i < _contractCodes.length; i++) {
      _contractAddresses[i] = contractAddresses[contractCodes[i]];
    }
  }

  function getLatestAddress(bytes2 _contractName) public view returns (address payable contractAddress) {
    contractAddress = contractAddresses[_contractName];
  }

  function checkIsAuthToGoverned(address _add) public view returns (bool) {
    return getLatestAddress("GV") == _add;
  }

}
