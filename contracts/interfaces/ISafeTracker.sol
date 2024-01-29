// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

interface ISafeTracker is IERC20 {

  function symbol() external view returns (string memory);

  function decimals() external view returns (uint8);

  function safe() external view returns (address);

  event CoverReInvestmentUSDCUpdated(uint investedUSDC);

  error OnlySafe();
  error InvestmentSurpassesLimit();
}
