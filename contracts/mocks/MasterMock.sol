// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../interfaces/INXMMaster.sol";
import "../interfaces/IMasterAwareV2.sol";
import "../modules/capital/Pool.sol";

contract MasterMock {

  enum Role {
    NonMember,
    Member,
    AdvisoryBord,
    Owner
  }

  mapping(address => Role) public members;
  mapping(address => bool) internalAddresses;
  mapping(address => bool) governanceAddresses;
  mapping(bytes2 => address payable) public contractAddresses;

  bool paused;
  address public tokenAddress;

  address public emergencyAdmin;

  /* utils */


  function setEmergencyAdmin(address _emergencyAdmin) external {
    emergencyAdmin = _emergencyAdmin;
  }

  function enrollGovernance(address newGov) public {
    governanceAddresses[newGov] = true;
  }

  function enrollInternal(address newInternal) public {
    internalAddresses[newInternal] = true;
  }

  function enrollMember(address newMember, Role role) public {
    members[newMember] = role;
  }

  function setLatestAddress(bytes2 contractName, address payable contractAddress) public {
    contractAddresses[contractName] = contractAddress;
  }

  function callChangeMaster(address payable contractAddress) public {
    IMasterAwareV2(contractAddress).changeMasterAddress(address(this));
  }

  function setTokenAddress(address _tokenAddress) public {
    tokenAddress = _tokenAddress;
  }

  function pause() public {
    paused = true;
  }

  function unpause() public {
    paused = false;
  }

  function upgradeCapitalPool(address payable currentPoolAddress, address payable newPoolAddress) external {
    Pool(currentPoolAddress).upgradeCapitalPool(newPoolAddress);
  }

  /* mocked implementations */

  function checkIsAuthToGoverned(address caller) public view returns (bool) {
    return governanceAddresses[caller];
  }

  function isInternal(address caller) public view returns (bool) {
    return internalAddresses[caller];
  }

  function isMember(address caller) public view returns (bool) {
    return members[caller] >= Role.Member;
  }

  function getLatestAddress(bytes2 contractName) public view returns (address payable) {
    return contractAddresses[contractName];
  }

  function isPause() public view returns (bool) {
    return paused;
  }

  /* unused functions */

  modifier unused {
    require(false, "Unexpected MasterMock call");
    _;
  }

  function delegateCallBack(bytes32) unused external {}

  function masterInitialized() unused public view returns (bool) {}

  function updatePauseTime(uint) unused public {}

  function owner() external view returns (address) {}

  function pauseTime() external view returns (uint) {}

}
