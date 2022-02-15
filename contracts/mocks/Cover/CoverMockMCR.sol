// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IMCR.sol";

contract CoverMockMCR is IMCR {

  uint public mockMCRValue;

  function updateMCRInternal(uint /*poolValueInEth*/, bool /*forceUpdate*/) external pure override {
    revert("Unsupported");
  }

  function getMCR() external override view returns (uint) {
    return mockMCRValue;
  }

  function setMCR(uint _mcrValue) external {
    mockMCRValue = _mcrValue;
  }

  function maxMCRFloorIncrement() external override pure returns (uint24) {
    revert("Unsupported");
  }

  function mcrFloor() external override pure returns (uint112) {
    revert("Unsupported");
  }

  function mcr() external override pure returns (uint112) {
    revert("Unsupported");
  }

  function desiredMCR() external override pure returns (uint112) {
    revert("Unsupported");
  }

  function lastUpdateTime() external override pure returns (uint32) {
    revert("Unsupported");
  }
}
