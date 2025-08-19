// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/SwapOperatorGeneric.sol";

contract P1MockSwapOperator is SwapOperatorGeneric {

  function orderInProgress() external override pure returns (bool) {
    return false;
  }

  receive() external payable {}
}
