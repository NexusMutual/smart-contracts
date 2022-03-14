// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract StateTest {
  uint public state;

  function setState(uint x) external {
    state = x;
    console.log('x %d', x);
    console.log('state %d', state);
  }
}
