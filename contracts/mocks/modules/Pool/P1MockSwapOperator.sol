// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

contract P1MockSwapOperator {

  function orderInProgress() public pure returns (bool) {
    return false;
  }
}
