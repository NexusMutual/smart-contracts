// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IMCR.sol";

contract CoverMockMCR is IMCR {

  uint public mockMCRValue;

  function updateMCRInternal(bool /*forceUpdate*/) external pure override {
    revert("Unsupported");
  }

  function getMCR() external override view returns (uint) {
    return mockMCRValue;
  }

  function setMCR(uint _mcrValue) external {
    mockMCRValue = _mcrValue;
  }

  function mcr() external override pure returns (uint80) {
    revert("Unsupported");
  }

  function desiredMCR() external override pure returns (uint80) {
    revert("Unsupported");
  }

  function lastUpdateTime() external override pure returns (uint32) {
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
