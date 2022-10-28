// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "./CLMockPool.sol";

contract CLMockPoolEtherRejecter is CLMockPool {
  receive() external payable override {
    revert("I secretly hate ether");
  }

  fallback() external payable override {
    revert("I secretly hate ether");
  }
}
