// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/RegistryAware.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/IWeth.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../interfaces/ISafeTracker.sol";

import "../../external/enzyme/IEnzymeFundValueCalculatorRouter.sol";
import "../../external/enzyme/IEnzymeV4Vault.sol";
import "../../external/enzyme/IEnzymeV4Comptroller.sol";
import "../../external/enzyme/IEnzymePolicyManager.sol";

/// @title A contract for swapping Pool's assets using CoW protocol
/// @dev This contract's address is set on the Pool's swapOperator variable via governance
contract SwapOperator is ISwapOperator, RegistryAware {
  using SafeERC20 for IERC20;

  // storage

  SwapRequest public swapRequest;
  SafeTransferRequest public safeTransferRequest;
  mapping(address => bool) public allowedSafeTransferAssets;

  bytes public currentOrderUID;

  // immutables

  IPool public immutable pool;
  ISafeTracker public immutable safeTracker;

  ICowSettlement public immutable cowSettlement;
  address public immutable enzymeV4VaultProxyAddress;
  IEnzymeFundValueCalculatorRouter public immutable enzymeFundValueCalculatorRouter;
  IWeth public immutable weth;
  address public immutable safe;
  address public immutable swapController;

  // constants

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint public constant MAX_SLIPPAGE_DENOMINATOR = 10000;
  uint public constant MIN_VALID_TO_PERIOD = 600; // 10 minutes
  uint public constant MAX_VALID_TO_PERIOD = 31 days; // 1 month
  uint public constant MAX_FEE = 0.3 ether;

  modifier onlyController() {
    require(msg.sender == swapController, OnlyController());
    _;
  }

  modifier onlySafe() {
    require(msg.sender == safe, OnlySafe());
    _;
  }

  constructor(
    address _registryAddress,
    address _cowSettlement,
    address _enzymeV4VaultProxyAddress,
    IEnzymeFundValueCalculatorRouter _enzymeFundValueCalculatorRouter,
    address _weth,
    address _safe,
    address _swapController
  ) RegistryAware(_registryAddress) {

    // internal contracts and addresses
    pool = IPool(fetch(C_POOL));
    safeTracker = ISafeTracker(fetch(C_SAFE_TRACKER));

    // cowswap
    cowSettlement = ICowSettlement(_cowSettlement);

    // enzyme
    enzymeV4VaultProxyAddress = _enzymeV4VaultProxyAddress;
    enzymeFundValueCalculatorRouter = _enzymeFundValueCalculatorRouter;

    // others
    weth = IWeth(_weth);
    safe = _safe;
    swapController = _swapController;
  }

  receive() external payable {}

  function domainSeparator() public view returns (bytes32) {
    return cowSettlement.domainSeparator();
  }

  function cowVaultRelayer() public view returns (address) {
    return cowSettlement.vaultRelayer();
  }

  function enzymeComptroller() public view returns (IEnzymeV4Comptroller) {
    return IEnzymeV4Comptroller(IEnzymeV4Vault(enzymeV4VaultProxyAddress).getAccessor());
  }

  /// @dev Compute the digest of an order using CoW protocol's logic
  /// @param order The order
  /// @return The order digest
  function getDigest(GPv2Order.Data calldata order) public view returns (bytes32) {
    return GPv2Order.hash(order, domainSeparator());
  }

  /// @dev Compute the UID of an order using CoW protocol's logic
  /// @param order The order
  /// @return The order UID (56 bytes)
  function getUID(GPv2Order.Data calldata order) public view returns (bytes memory) {
    bytes memory uid = new bytes(56);
    bytes32 digest = getDigest(order);
    GPv2Order.packOrderUidParams(uid, digest, order.receiver, order.validTo);
    return uid;
  }

  /// @dev Validate that a given UID is the correct one for a given order
  /// @param order The order
  /// @param providedOrderUID The UID
  function validateUID(GPv2Order.Data calldata order, bytes memory providedOrderUID) internal view {
    bytes memory calculatedOrderUID = getUID(order);
    require(
      keccak256(calculatedOrderUID) == keccak256(providedOrderUID),
      OrderUidMismatch(providedOrderUID, calculatedOrderUID)
    );
  }

  /// @dev Using oracle prices, returns the equivalent amount in `toAsset` for a given `fromAmount` in `fromAsset`
  /// Supports conversions for ETH to Asset, Asset to ETH, and Asset to Asset
  function getOracleAmount(address fromAsset, address toAsset, uint fromAmount) internal view returns (uint) {

    if (fromAsset == address(weth)) {
      // ETH -> toAsset
      return pool.getAssetForEth(toAsset, fromAmount);
    }

    if (toAsset == address(weth)) {
      // fromAsset -> ETH
      return pool.getEthForAsset(fromAsset, fromAmount);
    }

    // fromAsset -> toAsset via ETH
    uint fromAmountInEth = pool.getEthForAsset(fromAsset, fromAmount);

    return pool.getAssetForEth(toAsset, fromAmountInEth);
  }

  /// @dev Validates order.buyAmount against oracle prices and slippage limits
  ///      Uses the higher maxSlippageRatio of either sell or buy swap details,
  ///      then checks if the swap amount meets the minimum after slippage
  function validateOrderAmount(GPv2Order.Data calldata order, uint maxSlippage) internal view {
    uint oracleBuyAmount = getOracleAmount(address(order.sellToken), address(order.buyToken), order.sellAmount);

    uint maxSlippageAmount = (oracleBuyAmount * maxSlippage) / MAX_SLIPPAGE_DENOMINATOR;
    uint minBuyAmountOnMaxSlippage = oracleBuyAmount - maxSlippageAmount;

    require(
      order.buyAmount >= minBuyAmountOnMaxSlippage,
      AmountOutTooLow(order.buyAmount, minBuyAmountOnMaxSlippage)
    );
  }

  /// @dev Helper function to determine the SwapOperationType of the order
  /// NOTE: ETH orders has WETH address because ETH will be eventually converted to WETH to do the swap
  function getSwapOperationType(GPv2Order.Data memory order) internal view returns (SwapOperationType) {
    if (address(order.sellToken) == address(weth)) {
      return SwapOperationType.EthToAsset;
    }
    if (address(order.buyToken) == address(weth)) {
      return SwapOperationType.AssetToEth;
    }
    return SwapOperationType.AssetToAsset;
  }

  /// @dev Approve a given order to be executed, by presigning it on CoW protocol's settlement contract
  ///      Emits OrderPlaced event on success. Only one order can be open at the same time
  /// @param order - The order to be placed
  /// @param orderUID - the UID of the of the order to be placed
  function placeOrder(
    GPv2Order.Data calldata order,
    bytes calldata orderUID
  ) public onlyController whenNotPaused(PAUSE_SWAPS) {

    require(orderInProgress() == false, OrderInProgress(currentOrderUID));

    // Order UID and basic CoW params validations
    validateUID(order, orderUID);

    require(order.validTo >= block.timestamp + MIN_VALID_TO_PERIOD, BelowMinValidTo());
    require(order.validTo <= block.timestamp + MAX_VALID_TO_PERIOD, AboveMaxValidTo());

    require(order.receiver == address(this), InvalidReceiver(address(this)));

    require(address(order.sellToken) != ETH, InvalidTokenAddress('sellToken'));
    require(address(order.buyToken) != ETH, InvalidTokenAddress('buyToken'));

    require(order.sellTokenBalance == GPv2Order.BALANCE_ERC20, UnsupportedTokenBalance('sell'));
    require(order.buyTokenBalance == GPv2Order.BALANCE_ERC20, UnsupportedTokenBalance('buy'));

    uint totalOutAmount = order.sellAmount + order.feeAmount;
    SwapOperationType swapOperationType = getSwapOperationType(order);

    // validate max fee and max slippage
    uint feeInEther = address(order.sellToken) == address(weth)
      ? order.feeAmount
      : pool.getEthForAsset(address(order.sellToken), order.feeAmount);

    require(feeInEther <= MAX_FEE, AboveMaxFee(feeInEther, MAX_FEE));

    validateOrderAmount(order, totalOutAmount);

    {
      address transferedAsset = swapOperationType == SwapOperationType.EthToAsset
        ? ETH
        : address(order.sellToken);
      pool.transferAssetToSwapOperator(transferedAsset, totalOutAmount);

      if (swapOperationType == SwapOperationType.EthToAsset) {
        weth.deposit{value: totalOutAmount}();
      }
    }

    // Approve cowVaultRelayer contract to spend sellToken totalOutAmount
    order.sellToken.safeApprove(cowVaultRelayer(), totalOutAmount);

    // Store the orderUID
    currentOrderUID = orderUID;

    // Sign the Cow order
    cowSettlement.setPreSignature(orderUID, true);

    // Emit OrderPlaced event
    emit OrderPlaced(order);
  }

  /// @dev Close a previously placed order, returning assets to the pool (either fulfilled or not)
  /// Emits OrderClosed event on success
  /// @param order The order to close
  function closeOrder(GPv2Order.Data calldata order) external onlyController whenNotPaused(PAUSE_SWAPS) {

    require(orderInProgress() == true, NoOrderToClose());

    validateUID(order, currentOrderUID);

    // invalidate signature, cancel order and unapprove tokens
    cowSettlement.setPreSignature(currentOrderUID, false);
    cowSettlement.invalidateOrder(currentOrderUID);
    order.sellToken.safeApprove(cowVaultRelayer(), 0);

    delete currentOrderUID;

    // withdraw both buyToken and sellToken
    returnAssetToPool(order.buyToken);
    returnAssetToPool(order.sellToken);

    address sellToken = address(order.sellToken) == address(weth) ? ETH : address(order.sellToken);
    pool.clearSwapAssetAmount(sellToken);

    // emit event
    uint filledAmount = cowSettlement.filledAmount(currentOrderUID);
    emit OrderClosed(order, filledAmount);
  }

  /// @dev Return a given asset to the pool, either ETH or ERC20
  /// @param asset The asset
  function returnAssetToPool(IERC20 asset) internal {

    uint balance = asset.balanceOf(address(this));

    if (balance == 0) {
      return;
    }

    if (address(asset) != address(weth)) {
      asset.safeTransfer(address(pool), balance);
      return;
    }

    weth.withdraw(balance);
    (bool sent, ) = payable(address(pool)).call{value: balance}("");
    require(sent, TransferFailed(address(pool), balance, ETH));
  }

  /// @dev Exchanges ETH for Enzyme Vault shares with slippage control. Emits `Swapped` on success
  /// @param amountIn Amount of ETH to send into the Enzyme Vault
  /// @param amountOutMin Minimum Enzyme Vault shares expected to get out
  function swapETHForEnzymeVaultShare(
    uint amountIn,
    uint amountOutMin
  ) external onlyController whenNotPaused(PAUSE_SWAPS) {

    // Validate there's no current cow swap order going on
    require(orderInProgress() == false, OrderInProgress(currentOrderUID));

    IERC20Detailed toToken = IERC20Detailed(enzymeV4VaultProxyAddress);
    IEnzymeV4Comptroller comptrollerProxy = enzymeComptroller();

    // slippage
    {
      // TODO: fetch this from the swap request
      uint maxSlippageRatio = 0;
      require(maxSlippageRatio != 0, "FIXME");

      // check that amoutOutMin respects the requested slippage
      uint oracleAmountOut = getOracleAmount(ETH, address(toToken), amountIn);
      uint outOnMaxSlippage = oracleAmountOut - oracleAmountOut * maxSlippageRatio / MAX_SLIPPAGE_DENOMINATOR;
      require(amountOutMin >= outOnMaxSlippage, AmountOutMinLowerThanSlippage(amountOutMin, outOnMaxSlippage));
    }

    // denomination asset
    {
      address denominationAsset = comptrollerProxy.getDenominationAsset();
      require(denominationAsset == address(weth), InvalidDenominationAsset(address(weth), denominationAsset));
    }

    pool.transferAssetToSwapOperator(ETH, amountIn);
    weth.deposit{ value: amountIn }();

    uint fromTokenBalanceBefore = weth.balanceOf(address(this));
    uint toTokenBalanceBefore = toToken.balanceOf(address(this));

    weth.approve(address(comptrollerProxy), amountIn);
    comptrollerProxy.buyShares(amountIn, amountOutMin);
    weth.approve(address(comptrollerProxy), 0);

    uint fromTokenBalanceAfter = weth.balanceOf(address(this));
    uint toTokenBalanceAfter = toToken.balanceOf(address(this));

    uint actualAmountIn = fromTokenBalanceBefore - fromTokenBalanceAfter;
    require(actualAmountIn <= amountIn, AmountInTooHigh(amountIn, actualAmountIn));

    uint amountOut = toTokenBalanceAfter - toTokenBalanceBefore;
    require(amountOut >= amountOutMin, AmountOutTooLow(amountOut, amountOutMin));

    transferAssetTo(enzymeV4VaultProxyAddress, address(pool), toTokenBalanceAfter);

    if (fromTokenBalanceAfter > 0) {
      weth.withdraw(fromTokenBalanceAfter);
      transferAssetTo(ETH, address(pool), fromTokenBalanceAfter);
    }

    emit Swapped(ETH, enzymeV4VaultProxyAddress, amountIn, amountOut);
  }

  /// @dev Exchanges Enzyme Vault shares for ETH with slippage control. Emits `Swapped` on success
  /// @param amountIn Amount of Enzyme Vault shares to be swapped for ETH
  /// @param amountOutMin Minimum ETH out expected
  function swapEnzymeVaultShareForETH(
    uint amountIn,
    uint amountOutMin
  ) external onlyController whenNotPaused(PAUSE_SWAPS) {

    // Validate there's no current cow swap order going on
    require(orderInProgress() == false, OrderInProgress(currentOrderUID));

    IERC20Detailed fromToken = IERC20Detailed(enzymeV4VaultProxyAddress);
    IEnzymeV4Comptroller comptrollerProxy = enzymeComptroller();

    // slippage
    {
      uint maxSlippageRatio = 0;
      require(maxSlippageRatio != 0, "FIXME");

      // check that amoutOutMin respects the requested slippage
      uint oracleAmountOut = getOracleAmount(address(fromToken), ETH, amountIn);
      uint outOnMaxSlippage = oracleAmountOut - oracleAmountOut * maxSlippageRatio / MAX_SLIPPAGE_DENOMINATOR;
      require(amountOutMin >= outOnMaxSlippage, AmountOutMinLowerThanSlippage(amountOutMin, outOnMaxSlippage));
    }

    // denomination asset
    {
      address denominationAsset = comptrollerProxy.getDenominationAsset();
      require(denominationAsset == address(weth), InvalidDenominationAsset(address(weth), denominationAsset));
    }

    pool.transferAssetToSwapOperator(address(fromToken), amountIn);

    uint fromTokenBalanceBefore = fromToken.balanceOf(address(this));
    uint toTokenBalanceBefore = weth.balanceOf(address(this));

    // execution
    {
      address[] memory assetsOut = new address[](1);
      assetsOut[0] = address(weth);

      uint[] memory assetsOutPercentages = new uint[](1);
      assetsOutPercentages[0] = 10000;

      fromToken.approve(address(comptrollerProxy), amountIn);
      comptrollerProxy.redeemSharesForSpecificAssets(address(this), amountIn, assetsOut, assetsOutPercentages);
      fromToken.approve(address(comptrollerProxy), 0);
    }

    uint fromTokenBalanceAfter = fromToken.balanceOf(address(this));
    uint toTokenBalanceAfter = weth.balanceOf(address(this));

    uint actualAmountIn = fromTokenBalanceBefore - fromTokenBalanceAfter;
    require(actualAmountIn <= amountIn, AmountInTooHigh(amountIn, actualAmountIn));

    uint amountOut = toTokenBalanceAfter - toTokenBalanceBefore;
    require(amountOut >= amountOutMin, AmountOutTooLow(amountOut, amountOutMin));

    weth.withdraw(toTokenBalanceAfter);
    transferAssetTo(ETH, address(pool), toTokenBalanceAfter);

    if (fromTokenBalanceAfter > 0) {
      transferAssetTo(address(fromToken), address(pool), fromTokenBalanceAfter);
    }

    emit Swapped(enzymeV4VaultProxyAddress, ETH, amountIn, amountOut);
  }

  function transferAssetTo (address asset, address to, uint amount) internal {

    if (asset == ETH) {
      (bool ok, /* data */) = to.call{ value: amount }("");
      if (!ok) {
        revert TransferFailed(to, amount, ETH);
      }
      return;
    }

    IERC20 token = IERC20(asset);
    token.safeTransfer(to, amount);
  }

  /// @dev Add or remove an asset to the list of allowed safe transfer assets
  function setSafeTransferAssetAllowed(
    address asset,
    bool allowed
  ) external onlyContracts(C_GOVERNOR) whenNotPaused(PAUSE_SWAPS) {
    allowedSafeTransferAssets[asset] = allowed;
  }

  /// @dev Create a request for transfering assets to the safe
  function requestAssetTransfer(address asset, uint amount) external onlySafe whenNotPaused(PAUSE_SWAPS) {
    require(allowedSafeTransferAssets[asset] == true, SafeAssetNotAllowed(asset));
    safeTransferRequest = SafeTransferRequest(asset, amount);
  }

  /// @dev Transfer request amount of the asset to the safe
  function transferRequestedAsset(
    address requestedAsset, uint requestedAmount) external onlyController whenNotPaused(PAUSE_SWAPS) {

    (address asset, uint amount) = (safeTransferRequest.asset, safeTransferRequest.amount);
    require(amount > 0, SafeAssetAmountIsZero());

    delete safeTransferRequest;

    require(requestedAsset == asset, SafeAssetMismatch(requestedAsset, asset));
    require(requestedAmount == amount, SafeAssetAmountMismatch(requestedAmount, amount));

    pool.transferAssetToSwapOperator(asset, amount);
    transferAssetTo(asset, safe, amount);

    emit TransferredToSafe(asset, amount);
  }

  /// @dev Create a request to swap two assets
  function requestAssetSwap(
    address fromAsset,
    address toAsset,
    uint fromAmount,
    uint toAmountMin
  ) external onlyContracts(C_GOVERNOR) whenNotPaused(PAUSE_SWAPS) {
    swapRequest = SwapRequest(fromAsset, toAsset, fromAmount, toAmountMin);
  }

  /// @dev Recovers assets in the SwapOperator to the pool or a specified receiver, ensuring no ongoing CoW swap orders
  /// @param assetAddress Address of the asset to recover
  /// @param receiver Address to receive the recovered assets, if asset is not supported by the pool
  function recoverAsset(address assetAddress, address receiver) public onlyController whenNotPaused(PAUSE_SWAPS) {

    require(orderInProgress() == false, OrderInProgress(currentOrderUID));

    if (assetAddress == ETH) {

      uint ethBalance = address(this).balance;

      if (ethBalance == 0) {
        revert InvalidBalance(ethBalance, 0);
      }

      // we assume ETH is always supported so we directly transfer it back to the Pool
      (bool sent, ) = payable(address(pool)).call{value: ethBalance}("");
      require(sent, TransferFailed(address(pool), ethBalance, ETH));
      return;
    }

    IERC20 asset = IERC20(assetAddress);
    uint balance = asset.balanceOf(address(this));
    require(balance > 0, InvalidBalance(balance, 0));

    Asset[] memory assets = pool.getAssets();
    bool isSupported = false;

    for (uint i = 0; i < assets.length; i++) {
      if (assets[i].assetAddress == assetAddress && !assets[i].isAbandoned) {
        isSupported = true;
        break;
      }
    }

    address destination = isSupported ? address(pool) : receiver;
    asset.transfer(destination, balance);
  }

  /// @dev Checks if there is an ongoing order
  /// @return bool True if an order is currently in progress, otherwise false
  function orderInProgress() public view returns (bool) {
    return currentOrderUID.length > 0;
  }
}
