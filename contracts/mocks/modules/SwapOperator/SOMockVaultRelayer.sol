// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import '@openzeppelin/contracts-v4/token/ERC20/IERC20.sol';

contract SOMockVaultRelayer {
  constructor() {}

  function transfer(
    IERC20 token,
    address from,
    address to,
    uint256 amount
  ) external {
    if (from == address(this)) {
      token.transfer(to, amount);
    } else {
      token.transferFrom(from, to, amount);
    }
  }
}
