// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/extensions/IERC20Metadata.sol";

interface ISafeTracker is IERC20Metadata {

  function safe() external view returns (address);

  event CoverReInvestmentUSDCUpdated(uint investedUSDC);

  error OnlySafe();
  error InvestmentSurpassesLimit();
  error AmountExceedsBalance();
}
