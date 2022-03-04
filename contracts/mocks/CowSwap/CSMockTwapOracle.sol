// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

contract CSMockTwapOracle {
  uint256 constant DENOMINATOR = 10000;

  mapping(address => mapping(address => uint256)) priceNumerators;

  function addPrice(
    address tokenIn,
    address tokenOut,
    uint256 priceNumerator
  ) public {
    priceNumerators[tokenIn][tokenOut] = priceNumerator;
    priceNumerators[tokenOut][tokenIn] = DENOMINATOR**2 / priceNumerator;
  }

  function consult(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) public view returns (uint256) {
    uint256 priceNumerator = priceNumerators[tokenIn][tokenOut];
    require(priceNumerator > 0, 'No price for assets');

    return (priceNumerator * amountIn) / DENOMINATOR;
  }
}
