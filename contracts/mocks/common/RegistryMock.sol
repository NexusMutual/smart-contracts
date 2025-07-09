// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../interfaces/IRegistry.sol";

contract RegistryMock is IRegistry {

  // Storage for contract registration
  mapping(address => uint) private contractIndexByAddress;
  mapping(uint => address payable) private contractAddressByIndex;
  mapping(uint => bool) private contractTypeByIndex;

  function setEmergencyAdmin(address, bool) external pure {
    revert("Unsupported");
  }

  function proposePauseConfig(uint) external pure {
    revert("Unsupported");
  }

  function confirmPauseConfig(uint) external pure {
    revert("Unsupported");
  }

  function getSystemPause() external pure returns (SystemPause memory) {
    revert("Unsupported");
  }

  function getPauseConfig() external pure returns (uint) {
    return 0; // No pauses active
  }

  function isPaused(uint) external pure returns (bool) {
    revert("Unsupported");
  }

  function isEmergencyAdmin(address) external pure returns (bool) {
    revert("Unsupported");
  }

  /* == MEMBERSHIP AND AB MANAGEMENT == */
  function isMember(address) external pure returns (bool) {
    revert("Unsupported");
  }

  function getMemberId(address member) external pure returns (uint) {
    return (uint160(member) % 100) + 1;
  }

  function getMemberCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function isAdvisoryBoardMember(address) external pure returns (bool) {
    revert("Unsupported");
  }

  function getAdvisoryBoardSeat(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function swapAdvisoryBoardMember(uint, uint) external pure {
    revert("Unsupported");
  }

  function join(address, bytes calldata) external pure {
    revert("Unsupported");
  }

  function swap(address) external pure {
    revert("Unsupported");
  }

  function swapFor(address, address) external pure {
    revert("Unsupported");
  }

  function leave() external pure {
    revert("Unsupported");
  }

  /* == CONTRACT MANAGEMENT == */
  function isValidContractIndex(uint) external pure returns (bool) {
    revert("Unsupported");
  }

  function deployContract(uint, bytes32, address) external pure {
    revert("Unsupported");
  }

  function addContract(uint index, address payable contractAddress, bool isProxy) external override {
    require(contractAddress != address(0), "Invalid contract address");
    require(index > 0, "Invalid contract index");

    contractIndexByAddress[contractAddress] = index;
    contractAddressByIndex[index] = contractAddress;
    contractTypeByIndex[index] = isProxy;
  }

  function upgradeContract(uint, address) external pure {
    revert("Unsupported");
  }

  function removeContract(uint index) external override {
    address contractAddress = contractAddressByIndex[index];
    require(contractAddress != address(0), "Contract does not exist");

    delete contractIndexByAddress[contractAddress];
    delete contractAddressByIndex[index];
    delete contractTypeByIndex[index];
  }

  function getContractAddressByIndex(uint index) external view override returns (address payable) {
    return contractAddressByIndex[index];
  }

  function getContractTypeByIndex(uint index) external view override returns (bool) {
    return contractTypeByIndex[index];
  }

  function getContractIndexByAddress(address contractAddress) external view override returns (uint) {
    return contractIndexByAddress[contractAddress];
  }

  function getContracts(uint[] memory) external pure returns (Contract[] memory) {
    revert("Unsupported");
  }

  /* == MIGRATIONS == */
  function migrateMembers(address[] calldata) external pure {
    revert("Unsupported");
  }

  function migrateAdvisoryBoardMembers(address[] calldata) external pure {
    revert("Unsupported");
  }
}
