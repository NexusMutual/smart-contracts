// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "../interfaces/ICover.sol";

struct ExecutionDetails {
  uint256 notBefore;
  uint256 deadline;
  uint256 maxPremiumInAsset;
}

interface ICoverOrder {

  enum OrderStatus {
    Created,
    Executed,
    Cancelled
  }

  /* ==== FUNCTIONS ==== */

  function executeOrder(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    ExecutionDetails calldata executionPeriod,
    bytes calldata signature
  ) external payable returns (uint coverId);

  function maxApproveCoverContract(IERC20 token) external;

  function switchMembership(address newAddress) external;

  function rescueFunds(address assetAddress) external;

  /* ==== EVENTS ==== */

  event OrderExecuted(address owner, uint coverId);

  /* ==== ERRORS ==== */

  error OrderAlreadyExecuted();
  error OrderExpired();
  error OrderCannotBeExecutedYet();
  error OrderPriceNotMet();
  error NotAMember();
  error InvalidSignature();
  error InvalidOwnerAddress();
  error InvalidPaymentAsset();
  error TransferFailed(address to, uint value, address token);
  error ZeroBalance(address token);
}
