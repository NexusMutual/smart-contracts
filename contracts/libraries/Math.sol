// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

/**
 * @dev Simple library that defines min, max and babylonian sqrt functions
 */
library Math {

  function min(uint a, uint b) internal pure returns (uint) {
    return a < b ? a : b;
  }

  function max(uint a, uint b) internal pure returns (uint) {
    return a > b ? a : b;
  }

  function divRound(uint a, uint b) internal pure returns (uint) {
    return (a + b / 2) / b;
  }

  function divCeil(uint a, uint b) internal pure returns (uint) {
    return (a + b - 1) / b;
  }

  // babylonian method
  function sqrt(uint y) internal pure returns (uint) {

    if (y > 3) {
      uint z = y;
      uint x = y / 2 + 1;
      while (x < z) {
        z = x;
        x = (y / x + x) / 2;
      }
      return z;
    }

    if (y != 0) {
      return 1;
    }

    return 0;
  }

}
