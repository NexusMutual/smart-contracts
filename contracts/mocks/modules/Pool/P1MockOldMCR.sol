// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

// TODO:
// - should implement ILegacyMCR interface
// - contract name should be the same as the file name
// - use setters and getters instead of hardcoding values in the contract

contract P1MockMCR {
  function updateMCRInternal(bool) external pure {
    // do nothing
  }

  function getMCR() external pure returns (uint) {
    return 12348870328212262601890;
  }

  function desiredMCR() external pure returns (uint80) {
    return 10922706197119349905840;
  }

  function lastUpdateTime() external pure returns (uint80) {
    return 1751371403;
  }
}
