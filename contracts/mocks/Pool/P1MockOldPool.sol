// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;


interface P1MockOldPool {
  function twapOracle() external view returns (address);
  function getTokenPrice(address asset) external view returns (uint tokenPrice);
  function getPoolValueInEth() external view returns (uint);
  function priceFeedOracle() external view returns (address);
}
