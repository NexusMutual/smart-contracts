// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/INXMMaster.sol";

contract NXMMasterGeneric is INXMMaster {

  function tokenAddress() external pure returns (address) {
    revert("Unsupported");
  }

  function owner() external pure returns (address) {
    revert("Unsupported");
  }

  function emergencyAdmin() external pure returns (address) {
    revert("Unsupported");
  }

  function masterInitialized() external pure returns (bool) {
    revert("Unsupported");
  }

  function isInternal(address) external pure returns (bool) {
    revert("Unsupported");
  }

  function isPause() external pure returns (bool) {
    revert("Unsupported");
  }

  function isMember(address) external pure returns (bool) {
    revert("Unsupported");
  }

  function checkIsAuthToGoverned(address) external pure returns (bool) {
    revert("Unsupported");
  }

  function getLatestAddress(bytes2) external pure returns (address payable) {
    revert("Unsupported");
  }

  function contractAddresses(bytes2) external pure returns (address payable) {
    revert("Unsupported");
  }

  function upgradeMultipleContracts(bytes2[] calldata, address payable[] calldata) external pure {
    revert("Unsupported");
  }

  function removeContracts(bytes2[] calldata) external pure {
    revert("Unsupported");
  }

  function addNewInternalContracts(bytes2[] calldata, address payable[] calldata, uint[] calldata) external pure {
    revert("Unsupported");
  }

  function updateOwnerParameters(bytes8, address payable) external pure {
    revert("Unsupported");
  }
}
