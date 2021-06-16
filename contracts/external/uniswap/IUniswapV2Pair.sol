// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IUniswapV2Pair {
  function getReserves() external view returns (uint112, uint112, uint32);
}
