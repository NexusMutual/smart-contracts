// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface ITwapOracle {
  function pairFor(address tokenA, address tokenB) external view returns (address);
  function consult(address tokenIn, uint amountIn, address tokenOut) external view returns (uint);
  function periodSize() external view returns (uint);
}
