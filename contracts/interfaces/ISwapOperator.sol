// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../external/cow/GPv2Order.sol";
import "../interfaces/IPool.sol";

interface ISwapOperator {

  enum SwapOperationType {
    EthToAsset,
    AssetToEth,
    AssetToAsset
  }

  /* ========== VIEWS ========== */

  function getDigest(GPv2Order.Data calldata order) external view returns (bytes32);

  function getUID(GPv2Order.Data calldata order) external view returns (bytes memory);

  function orderInProgress() external view returns (bool);

  /* ==== MUTATIVE FUNCTIONS ==== */

  function placeOrder(GPv2Order.Data calldata order, bytes calldata orderUID) external;

  function closeOrder(GPv2Order.Data calldata order) external;

  function swapEnzymeVaultShareForETH(uint amountIn, uint amountOutMin) external;

  function swapETHForEnzymeVaultShare(uint amountIn, uint amountOutMin) external;

  function recoverAsset(address assetAddress, address receiver) external;

  /* ========== EVENTS AND ERRORS ========== */

  event OrderPlaced(GPv2Order.Data order);
  event OrderClosed(GPv2Order.Data order, uint filledAmount);
  event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);

  // Swap Order
  error OrderInProgress(bytes currentOrderUID);
  error NoOrderInPlace();
  error OrderUidMismatch(bytes providedOrderUID, bytes expectedOrderUID);
  error UnsupportedTokenBalance(string kind);
  error InvalidReceiver(address validReceiver);
  error TokenDisabled(address token);
  error AmountOutTooLow(uint amountOut, uint minAmount);
  error InvalidTokenAddress(string token);
  error InvalidDenominationAsset(address invalidAsset, address validAsset);

  // Valid To
  error BelowMinValidTo(uint minValidTo);
  error AboveMaxValidTo(uint maxValidTo);

  // Balance
  error InvalidBalance(uint tokenBalance, uint limit);
  error InvalidPostSwapBalance(uint postSwapBalance, uint limit);

  // Access Controls
  error OnlyController();
  
  // Transfer
  error TransferFailed(address to, uint value, address token);

  // Cool down
  error InsufficientTimeBetweenSwaps(uint minValidSwapTime);

  // Fee
  error AboveMaxFee(uint feeInEth, uint maxFee);
}
