// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/INXMMaster.sol";

contract NXMasterGeneric is INXMMaster {

  function tokenAddress() external pure virtual returns (address) {
    revert("Unsupported");
  }

  function emergencyAdmin() external pure virtual returns (address) {
    revert("Unsupported");
  }

  function isInternal(address) external pure virtual returns (bool) {
    revert("Unsupported");
  }

  function isPause() external pure virtual returns (bool) {
    revert("Unsupported");
  }

  function isMember(address) external pure virtual returns (bool) {
    revert("Unsupported");
  }

  function checkIsAuthToGoverned(address) external pure virtual returns (bool) {
    revert("Unsupported");
  }

  function getLatestAddress(bytes2) external virtual view returns (address payable) {
    revert("Unsupported");
  }

  function contractAddresses(bytes2) external virtual view returns (address payable) {
    revert("Unsupported");
  }

  function transferOwnershipToRegistry(address) pure external {
    revert("Unsupported");
  }

  function migrate(address) pure external {
    revert("Unsupported");
  }
}
