// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../external/cow/GPv2Order.sol";
import "../external/enzyme/IEnzymeFundValueCalculatorRouter.sol";
import "./ICowSettlement.sol";
import "./IWeth.sol";

interface ISwapOperator {

  enum SwapKind {
    ExactInput,
    ExactOutput
  }

  struct SwapRequest {
    address fromAsset;
    address toAsset;
    uint fromAmount;
    uint toAmount;
    SwapKind swapKind;
    uint32 deadline; // order submission deadline
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

  /* ==== MUTATIVE FUNCTIONS ==== */

  function placeOrder(GPv2Order.Data calldata order, bytes calldata orderUID) external;

  function closeOrder(GPv2Order.Data calldata order) external;

  function swapEnzymeVaultShareForETH(uint fromAmount, uint toAmountMin) external;

  function swapETHForEnzymeVaultShare(uint fromAmount, uint toAmountMin) external;

  function recoverAsset(address assetAddress, address receiver) external;

  function requestAssetSwap(SwapRequest calldata swapRequest) external;

  /* ========== EVENTS AND ERRORS ========== */

  event OrderPlaced(GPv2Order.Data order);
  event OrderClosed(GPv2Order.Data order, uint filledAmount);
  event Swapped(address indexed fromAsset, address indexed toAsset, uint fromAmount, uint toAmount);
  event TransferredToSafe(address asset, uint amount);
  event SwapRequestCreated(
    address indexed fromAsset,
    address indexed toAsset,
    uint fromAmount,
    uint toAmount,
    SwapKind swapKind,
    uint32 deadline
  );

  // Swap Order
  error OrderInProgress(bytes currentOrderUID);
  error NoOrderToClose();
  error OrderUidMismatch(bytes providedOrderUID, bytes expectedOrderUID);
  error UnsupportedTokenBalance(string kind);
  error InvalidReceiver(address validReceiver);
  error InvalidRecoveryReceiver();
  error InvalidSwapKind();

  // swap request vs amount
  error FromAmountMismatch(uint expectedFromAmount, uint actualFromAmount);
  error ToAmountMismatch(uint expectedToAmount, uint actualToAmount);
  error FromAmountTooHigh(uint expectedFromAmount, uint actualFromAmount);
  error ToAmountTooLow(uint expectedToAmount, uint actualToAmount);

  // order amounts vs actual amounts
  error SwappedFromAmountTooHigh(uint expectedMaxFromAmount, uint actualFromAmount);
  error SwappedToAmountTooLow(uint expectedMinToAmount, uint actualToAmount);

  error FeeNotZero();
  error InvalidDenominationAsset(address expectedAsset, address actualAsset);
  error InvalidAsset(address requestedAsset, address orderAsset);
  error UnsupportedAsset(address asset);
  error InvalidSwapOperationForAsset(address asset);
  error SwapDeadlineExceeded(uint deadline, uint blockTimestamp);
  error SameAssetSwapRequest(address asset);

  // Safe Transfer
  error SafeAssetNotAllowed(address asset);
  error SafeAssetAmountIsZero();
  error SafeAssetMismatch(address requestedAsset, address asset);
  error SafeAssetAmountMismatch(uint requestedAmount, uint amount);

  // Valid To
  error BelowMinValidTo();
  error AboveMaxValidTo();

  // Asset recovery
  error ZeroBalance();

  // Access Controls
  error OnlyController();
  error OnlySafe();

  // Transfer
  error TransferFailed(address to, uint value, address token);
}
