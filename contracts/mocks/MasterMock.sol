// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../interfaces/INXMMaster.sol";
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
  mapping(bytes2 => address payable) contractAddresses;

  bool paused;
  address public tokenAddress;

  /* utils */

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

  function isOwner(address) unused public view returns (bool) {}

  function updatePauseTime(uint) unused public {}

  function dAppLocker() unused public view returns (address) {}

  function dAppToken() unused public view returns (address) {}

  function owner() external view returns (address) {}

  function pauseTime() external view returns (uint) {}

}
