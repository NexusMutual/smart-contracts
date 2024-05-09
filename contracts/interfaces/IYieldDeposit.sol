// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

interface IYieldDeposit {
  /* ========== VIEWS ========== */

  function getCurrentTokenRate(address tokenAddress) external returns (uint);

  /* ==== MUTATIVE FUNCTIONS ==== */

  function deposit(address tokenAddress, uint256 amount) external;

  function withdraw(address tokenAddress, uint amount) external;

  function withdrawAll(address tokenAddress) external;

  function withdrawAvailableYield(address tokenAddress) external;

  function updateCoverPricePercentage(address tokenAddress, uint16 newCoverPricePercentage) external;

  /* ========== EVENTS AND ERRORS ========== */

  event TokenDeposited(address from, uint256 depositAmount, uint256 priceRate);
  event TokenWithdrawn(address from, uint256 withdrawalAmount, uint256 priceRate);

  error TokenNotSupported();
  error InvalidDepositAmount();
  error InvalidWithdrawalAmount(uint maxWithdrawalAmount);
  error InvalidTokenRate();
  error NoYieldAvailable();
  error InsufficientDepositForWithdrawal();
}
