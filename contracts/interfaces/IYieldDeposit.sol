// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

interface IYieldDeposit {
  /* ========== VIEWS ========== */

  function getCurrentTokenRate() external returns (uint);

  /* ==== MUTATIVE FUNCTIONS ==== */

  function deposit(uint256 amount) external;

  function withdraw() external;

  function withdrawAvailableYield() external;

  function updateCoverPricePercentage(uint16 newCoverPricePercentage) external;

  /* ========== EVENTS AND ERRORS ========== */

  event TokenDeposited(address from, uint256 depositAmount, uint256 coverAmountBought);
  event TokenWithdrawn(address from, uint256 withdrawalAmount);

  error InvalidDepositAmount();
  error InvalidTokenRate();
  error NoYieldAvailable();
  error InsufficientDepositForWithdrawal();
  error WithdrawBeforeMakingNewDeposit();
}
