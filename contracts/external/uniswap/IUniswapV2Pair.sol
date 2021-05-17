// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

interface IUniswapV2Pair {
  function getReserves() external view returns (uint112, uint112, uint32);
}
