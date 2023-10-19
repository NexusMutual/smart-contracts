// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "./RammMockPool.sol";

contract RammMockPoolEtherRejecter is RammMockPool {

  constructor(address _master, address _mcr, address _nxmTokenAddress) RammMockPool(_master, _mcr, _nxmTokenAddress) {}

  receive() external payable override {
    revert("I secretly hate ether");
  }

  fallback() external payable override {
    revert("I secretly hate ether");
  }
}
