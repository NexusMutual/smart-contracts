// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IMCR.sol";

contract MCRGeneric is IMCR {
  function setPool(address) public virtual {
    revert("Unsupported");
  }

  function getMCR() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function updateMCR(uint) public virtual {
    revert("Unsupported");
  }

  function updateMCRInternal(bool) public virtual {
    revert("Unsupported");
  }

  function mcr() external virtual view returns (uint80) {
    revert("Unsupported");
  }

  function desiredMCR() external virtual pure returns (uint80) {
    revert("Unsupported");
  }

  function lastUpdateTime() external virtual pure returns (uint32) {
    revert("Unsupported");
  }

  function gearingFactor() external pure returns (uint24) {
    revert("Unsupported");
  }

  function maxMCRIncrement() external pure returns (uint16) {
    revert("Unsupported");
  }

  function minUpdateTime() external pure returns (uint16) {
    revert("Unsupported");
  }
}
