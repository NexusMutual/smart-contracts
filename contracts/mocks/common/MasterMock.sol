// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IMasterAwareV2.sol";

contract MasterMock is INXMMaster {

  enum Role {
    Unassigned,
    AdvisoryBoard,
    Member,
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

  function setEmergencyPause(bool _paused) external {
    paused = _paused;
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

  function transferOwnershipToRegistry(address) pure external {
    revert("Unsupported");
  }

  function migrate(address) pure external {
    revert("Unsupported");
  }
}
