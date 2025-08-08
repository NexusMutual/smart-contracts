// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "./SOMockPool.sol";

contract SOMockPoolRejectingEth is SOMockPool {

  constructor(Asset[] memory _assets) SOMockPool(_assets) {}

  receive() external payable override {
    revert("No ETH for me");
  }

}
