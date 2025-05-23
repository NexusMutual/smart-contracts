// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "./ICover.sol";
import "./INXMToken.sol";
import "./IWeth.sol";

struct ExecutionDetails {
  address buyer;
  uint256 notExecutableBefore;
  uint256 executableUntil;
  uint256 renewableUntil;
  uint256 renewablePeriodBeforeExpiration;
  uint256 maxPremiumInAsset;
}

struct OrderDetails {
  uint256 coverId;
  uint24 productId;
  uint96 amount;
  uint32 period;
  uint8 paymentAsset;
  uint8 coverAsset;
  address owner;
  string ipfsData;
  uint16 commissionRatio;
  address commissionDestination;
}

struct SettlementDetails {
  uint256 fee;
  address feeDestination;
}

struct OrderStatus {
  uint32 coverId;
  bool isCancelled;
}

interface ILimitOrders {

  /* ==== IMMUTABLES ==== */

  function nxmToken() external view returns (INXMToken);

  function weth() external view returns (IWeth);

  /* ==== FUNCTIONS ==== */

  function executeOrder(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    ExecutionDetails calldata executionDetails,
    bytes calldata signature,
    SettlementDetails memory settlementDetails
  ) external returns (uint coverId);

  /* ==== EVENTS ==== */

  event OrderExecuted(address owner, uint originalCoverId, uint coverId, bytes32 id);
  event OrderCancelled(bytes32 id);

  /* ==== ERRORS ==== */

  error OnlyInternalSolver();
  error OrderAlreadyCancelled();
  error OrderExpired();
  error RenewalExpired();
  error OrderCannotBeExecutedYet();
  error OrderCannotBeRenewedYet();
  error RenewablePeriodBeforeExpirationExceedsMaximum();
  error ExpiredCoverCannotBeRenewed();
  error OrderPriceNotMet();
  error NotOrderOwner();
  error InvalidOwnerAddress();
  error InvalidBuyerAddress();
}
