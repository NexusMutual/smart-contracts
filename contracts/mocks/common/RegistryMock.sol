// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IRegistry.sol";

contract RegistryMock is IRegistry {
  mapping(address => uint) private contractIndexByAddress;
  mapping(uint => address payable) private contractAddressByIndex;
  mapping(uint => bool) private contractTypeByIndex;

  mapping(uint memberId => address member) internal members;
  mapping(address member => uint memberId) internal memberIds;
  uint internal memberCount;

  uint internal pauseConfig;

  /* == EMERGENCY PAUSE == */
  function setEmergencyAdmin(address, bool) external virtual {
    revert("Unsupported");
  }

  function proposePauseConfig(uint) external virtual {
    revert("Unsupported");
  }

  function confirmPauseConfig(uint config) external virtual {
    pauseConfig = config;
  }

  function getSystemPause() external virtual view returns (SystemPause memory) {
    revert("Unsupported");
  }

  function getPauseConfig() external virtual view returns (uint config) {
    return pauseConfig;
  }

  function isPaused(uint) external virtual view returns (bool) {
    revert("Unsupported");
  }

  function isEmergencyAdmin(address) external virtual view returns (bool) {
    revert("Unsupported");
  }

  /* == MEMBERSHIP AND AB MANAGEMENT == */
  function isMember(address member) external virtual view returns (bool) {
    return memberIds[member] > 0;
  }

  function getMemberId(address member) external virtual view returns (uint) {
    return memberIds[member];
  }

  function getMemberCount() external virtual view returns (uint) {
    return memberCount;
  }

  function isAdvisoryBoardMember(address) external virtual view returns (bool) {
    revert("Unsupported");
  }

  function getAdvisoryBoardSeat(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function swapAdvisoryBoardMember(uint, uint) external virtual {
    revert("Unsupported");
  }

  function join(address member, bytes memory) external virtual {
    memberCount++;
    memberIds[member] = memberCount;
    members[memberCount] = member;
  }

  function swap(address) external virtual {
    revert("Unsupported");
  }

  function swapFor(address, address) external virtual {
    revert("Unsupported");
  }

  function leave() external virtual {
    revert("Unsupported");
  }

  /* == CONTRACT MANAGEMENT == */
  function isValidContractIndex(uint) external virtual pure returns (bool) {
    revert("Unsupported");
  }

  function deployContract(uint, bytes32, address) external virtual {
    revert("Unsupported");
  }

  function addContract(uint index, address payable contractAddress, bool isProxy) external virtual {
    contractIndexByAddress[contractAddress] = index;
    contractAddressByIndex[index] = contractAddress;
    contractTypeByIndex[index] = isProxy;
  }

  function upgradeContract(uint, address) external virtual {
    revert("Unsupported");
  }

  function removeContract(uint) external virtual {
    revert("Unsupported");
  }

  function getContractAddressByIndex(uint index) external virtual view returns (address payable) {
    return contractAddressByIndex[index];
  }

  function getContractTypeByIndex(uint index) external virtual view returns (bool) {
    return contractTypeByIndex[index];
  }

  function getContractIndexByAddress(address contractAddress) external virtual view returns (uint) {
    return contractIndexByAddress[contractAddress];
  }

  function getContracts(uint[] memory) external virtual view returns (Contract[] memory) {
    revert("Unsupported");
  }

  /* == MIGRATIONS == */
  function migrateMembers(address[] calldata) external virtual {
    revert("Unsupported");
  }

  function migrateAdvisoryBoardMembers(address[] calldata) external virtual {
    revert("Unsupported");
  }
}
