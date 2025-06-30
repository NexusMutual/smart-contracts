// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IRegistry.sol";

contract RegistryGeneric is IRegistry {
  function setEmergencyAdmin(address, bool) external override pure {
    revert("Unsupported");
  }

  function proposePauseConfig(uint) external override pure {
    revert("Unsupported");
  }

  function confirmPauseConfig(uint) external override pure {
    revert("Unsupported");
  }

  function getSystemPause() external override pure returns (SystemPause memory) {
    revert("Unsupported");
  }

  function getPauseConfig() public virtual view returns (uint){
    revert("Unsupported");
  }

  function isPaused(uint) external override pure returns (bool) {
    revert("Unsupported");
  }

  function isEmergencyAdmin(address) external override pure returns (bool) {
    revert("Unsupported");
  }

  function isMember(address) external pure returns (bool) {
    revert("Unsupported");
  }

  function getMemberId(address) external pure returns (uint) {
    revert("Unsupported");
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

  function getAdvisoryBoardSeat(uint, uint) external pure {
    revert("Unsupported");
  }

  function swapAdvisoryBoardMember(uint, uint) external pure {
    revert("Unsupported");
  }

  function join(address, bytes memory) external pure {
    revert("Unsupported");
  }

  function switchTo(address) external pure {
    revert("Unsupported");
  }

  function switchFor(address, address) external pure {
    revert("Unsupported");
  }

  function leave() external pure {
    revert("Unsupported");
  }

  function isValidContractIndex(uint) external pure returns (bool) {
    revert("Unsupported");
  }

  function deployContract(uint, bytes32, address) external pure {
    revert("Unsupported");
  }

  function addContract(uint, address, bool) external virtual {
    revert("Unsupported");
  }

  function upgradeContract(uint, address) external pure {
    revert("Unsupported");
  }

  function removeContract(uint) external pure {
    revert("Unsupported");
  }

  function getContractAddressByIndex(uint) external virtual view returns (address payable) {
    revert("Unsupported");
  }

  function getContractTypeByIndex(uint) external pure returns (bool) {
    revert("Unsupported");
  }

  function getContractIndexByAddress(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getContracts(uint[] memory) external pure returns (Contract[] memory) {
    revert("Unsupported");
  }

  function migrateMembers(address[] calldata) external pure {
    revert("Unsupported");
  }

  function migrateAdvisoryBoardMembers(address[] calldata) external pure {
    revert("Unsupported");
  }
}
