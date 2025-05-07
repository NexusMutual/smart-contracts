// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../external/cow/GPv2Order.sol";
import "../external/enzyme/IEnzymeFundValueCalculatorRouter.sol";
import "./ICowSettlement.sol";
import "./IWeth.sol";

interface ISwapOperator {

  enum SwapOperationType {
    EthToAsset,
    AssetToEth,
    AssetToAsset
  }

  struct SafeTransferRequest {
    address asset;
    uint amount;
  }

  struct SwapRequest {
    address fromAsset;
    address toAsset;
    uint fromAmount;
    uint toAmountMin;
  }

  /* ========== VIEWS ========== */

  function getDigest(GPv2Order.Data calldata order) external view returns (bytes32);

  function getUID(GPv2Order.Data calldata order) external view returns (bytes memory);

  function orderInProgress() external view returns (bool);

  function currentOrderUID() external view returns (bytes memory);

  /* ========== IMMUTABLES ========== */

  function cowSettlement() external view returns (ICowSettlement);

  function cowVaultRelayer() external view returns (address);

  function swapController() external view returns (address);

  function weth() external view returns (IWeth);

  function domainSeparator() external view returns (bytes32);

  function enzymeV4VaultProxyAddress() external view returns (address);

  function enzymeFundValueCalculatorRouter() external view returns (IEnzymeFundValueCalculatorRouter);

  /* ==== MUTATIVE FUNCTIONS ==== */

  function placeOrder(GPv2Order.Data calldata order, bytes calldata orderUID) external;

  function closeOrder(GPv2Order.Data calldata order) external;

  function swapEnzymeVaultShareForETH(uint amountIn, uint amountOutMin) external;

  function swapETHForEnzymeVaultShare(uint amountIn, uint amountOutMin) external;

  function recoverAsset(address assetAddress, address receiver) external;

  function setSafeTransferAssetAllowed(address asset, bool allowed) external;

  function requestAssetTransfer(address asset, uint amount) external;

  function transferRequestedAsset(address requestedAsset, uint requestedAmount) external;

  function requestAssetSwap(address assetIn, address assetOut, uint amountIn, uint amountOutMin) external;

  /* ========== EVENTS AND ERRORS ========== */

  event OrderPlaced(GPv2Order.Data order);
  event OrderClosed(GPv2Order.Data order, uint filledAmount);
  event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);
  event TransferredToSafe(address asset, uint amount);

  // Swap Order
  error OrderInProgress(bytes currentOrderUID);
  error NoOrderToClose();
  error OrderUidMismatch(bytes providedOrderUID, bytes expectedOrderUID);
  error UnsupportedTokenBalance(string kind);
  error InvalidReceiver(address validReceiver);
  error TokenDisabled(address token);
  error AmountInTooHigh(uint expectedAmountIn, uint actualAmountIn);
  error AmountOutTooLow(uint amountOut, uint minAmount);
  error AmountOutMinLowerThanSlippage(uint amountOutMin, uint amountOutOnMaxSlippage);
  error InvalidTokenAddress(string token);
  error InvalidDenominationAsset(address expectedAsset, address actualAsset);

  // Safe Transfer
  error SafeAssetNotAllowed(address asset);
  error SafeAssetAmountIsZero();
  error SafeAssetMismatch(address requestedAsset, address asset);
  error SafeAssetAmountMismatch(uint requestedAmount, uint amount);

  // Valid To
  error BelowMinValidTo();
  error AboveMaxValidTo();

  // Balance
  error InvalidBalance(uint tokenBalance, uint limit);
  error InvalidPostSwapBalance(uint postSwapBalance, uint limit);

  // Access Controls
  error OnlyController();
  error OnlySafe();

  // Transfer
  error TransferFailed(address to, uint value, address token);

  // Cool down
  error InsufficientTimeBetweenSwaps(uint minValidSwapTime);

  // Fee
  error AboveMaxFee(uint feeInEth, uint maxFee);
}
