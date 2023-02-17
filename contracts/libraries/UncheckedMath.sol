// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

/**
 * @dev Simple library that defines basic math functions that allow overflow
 */
library UncheckedMath {

  function uncheckedAdd(uint a, uint b) internal pure returns (uint) {
    unchecked { return a + b; }
  }

  function uncheckedSub(uint a, uint b) internal pure returns (uint) {
    unchecked { return a - b; }
  }

  function uncheckedMul(uint a, uint b) internal pure returns (uint) {
    unchecked { return a * b; }
  }

  function uncheckedDiv(uint a, uint b) internal pure returns (uint) {
    unchecked { return a / b; }
  }

}
