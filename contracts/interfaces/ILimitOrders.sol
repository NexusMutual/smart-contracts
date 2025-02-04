// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "./ICover.sol";
import "./IMemberRoles.sol";
import "./INXMMaster.sol";
import "./INXMToken.sol";
import "./IWeth.sol";

struct ExecutionDetails {
  uint256 notBefore;
  uint256 deadline;
  uint256 maxPremiumInAsset;
  uint8 maxNumberOfRenewals;
  uint32 renewWhenLeft;
}

struct OrderDetails {
  uint192 coverId;
  uint32 renewWhenLeft;
  uint8 maxRenewals;
  uint8 executionCounter;
  bool isCancelled;
}

interface ILimitOrders {

  enum OrderStatus {
    Created,
    Executed,
    Cancelled
  }

  /* ==== IMMUTABLES ==== */

  function nxmToken() external view returns (INXMToken);

  function weth() external view returns (IWeth);

  /* ==== FUNCTIONS ==== */

  function executeOrder(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    ExecutionDetails calldata executionDetails,
    bytes calldata signature,
    uint solverFee
  ) external payable returns (uint coverId);

  /* ==== EVENTS ==== */

  event OrderExecuted(address owner, uint coverId, bytes32 id);
  event OrderCancelled(bytes32 id);

  /* ==== ERRORS ==== */

  error OnlyController();
  error OrderAlreadyExecuted();
  error OrderAlreadyCancelled();
  error OrderExpired();
  error OrderCannotBeExecutedYet();
  error OrderPriceNotMet();
  error NotOrderOwner();
  error NotAMember();
  error InvalidSignature();
  error InvalidOwnerAddress();
  error InvalidPaymentAsset();
  error TransferFailed(address to, uint value, address token);
  error ZeroBalance(address token);
}
