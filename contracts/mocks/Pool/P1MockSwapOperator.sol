// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";

contract P1MockSwapOperator {

  function orderInProgress() public returns (bool) {
    return false;
  }
}
