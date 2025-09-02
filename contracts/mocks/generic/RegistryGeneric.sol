// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../interfaces/IRegistry.sol";

contract RegistryGeneric is IRegistry {

  function setEmergencyAdmin(address /* _emergencyAdmin */, bool /* enabled */) external pure {
    revert("Unsupported");
  }

  function proposePauseConfig(uint /* config */) external pure {
    revert("Unsupported");
  }

  function confirmPauseConfig(uint /* config */) external virtual {
    revert("Unsupported");
  }

  function getSystemPause() external pure returns (SystemPause memory) {
    revert("Unsupported");
  }

  function getPauseConfig() external view virtual returns (uint /*  config  */) {
    revert("Unsupported");
  }

  function isPaused(uint /* mask */) external pure returns (bool) {
    revert("Unsupported");
  }

  function isEmergencyAdmin(address /* member */) external pure returns (bool) {
    revert("Unsupported");
  }

  /* == MEMBERSHIP MANAGEMENT == */
  function isMember(address /* member */) external view virtual returns (bool) {
    revert("Unsupported");
  }

  function getMemberId(address /* member */) external view virtual returns (uint) {
    revert("Unsupported");
  }

  function getMemberAddress(uint /* memberId */) external view virtual returns (address) {
    revert("Unsupported");
  }

  function getMemberCount() external view virtual returns (uint) {
    revert("Unsupported");
  }

  function getLastMemberId() external pure returns (uint) {
    revert("Unsupported");
  }

  function join(address /* member */, bytes memory /* signature */) external payable virtual {
    revert("Unsupported");
  }

  function switchTo(address /* to */) external pure {
    revert("Unsupported");
  }

  function switchFor(address /* from */, address /* to */) external pure {
    revert("Unsupported");
  }

  function leave() external pure {
    revert("Unsupported");
  }

  function setKycAuthAddress(address /* kycAuthAddress */) external pure {
    revert("Unsupported");
  }

  function getKycAuthAddress() external view virtual returns (address) {
    revert("Unsupported");
  }

  /* == ADVISORY BOARD MANAGEMENT == */
  function isAdvisoryBoardMember(address /* member */) external view virtual returns (bool) {
    revert("Unsupported");
  }

  function isAdvisoryBoardMemberById(uint /* member */) external view virtual returns (bool) {
    revert("Unsupported");
  }

  function getAdvisoryBoardSeat(address /* member */) external view virtual returns (uint) {
    revert("Unsupported");
  }

  function getMemberAddressBySeat(uint /* seat */) external pure returns (address) {
    revert("Unsupported");
  }

  function swapAdvisoryBoardMember(uint /* from */, uint /* to */) external virtual {
    revert("Unsupported");
  }

  /* == CONTRACT MANAGEMENT == */
  function isValidContractIndex(uint /* index */) external pure virtual returns (bool) {
    revert("Unsupported");
  }

  function isProxyContract(uint /* index */) external pure returns (bool) {
    revert("Unsupported");
  }

  function getContractAddressByIndex(uint /* index */) external view virtual returns (address payable) {
    revert("Unsupported");
  }

  function getContractIndexByAddress(address /* contractAddress */) external view virtual returns (uint) {
    revert("Unsupported");
  }

  function getContracts(uint[] memory /* indexes */) external pure returns (Contract[] memory) {
    revert("Unsupported");
  }

  function deployContract(uint /* index */, bytes32 /* salt */, address /* implementation */) external pure {
    revert("Unsupported");
  }

  function addContract(uint /* index */, address /* contractAddress */, bool /* isProxy */) external virtual {
    revert("Unsupported");
  }

  function upgradeContract(uint /* index */, address /* implementation */) external pure {
    revert("Unsupported");
  }

  function removeContract(uint /* index */) external virtual {
    revert("Unsupported");
  }

  /* == MIGRATIONS == */
  function migrateMembers(address[] calldata /* membersToMigrate */) external pure {
    revert("Unsupported");
  }

  function migrateAdvisoryBoardMembers(address[] calldata /* abMembers */) external pure {
    revert("Unsupported");
  }

}
