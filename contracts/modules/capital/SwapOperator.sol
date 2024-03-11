// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../external/cow/GPv2Order.sol";
import "../../interfaces/ICowSettlement.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/IWeth.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/ISwapOperator.sol";

import "../../external/enzyme/IEnzymeFundValueCalculatorRouter.sol";
import "../../external/enzyme/IEnzymeV4Vault.sol";
import "../../external/enzyme/IEnzymeV4Comptroller.sol";
import "../../external/enzyme/IEnzymePolicyManager.sol";

/// @title A contract for swapping Pool's assets using CoW protocol
/// @dev This contract's address is set on the Pool's swapOperator variable via governance
contract SwapOperator is ISwapOperator {
  using SafeERC20 for IERC20;

  // Storage
  bytes public currentOrderUID;

  // Immutables
  ICowSettlement public immutable cowSettlement;
  address public immutable cowVaultRelayer;
  INXMMaster public immutable master;
  address public immutable swapController;
  IWeth public immutable weth;
  bytes32 public immutable domainSeparator;

  address public immutable enzymeV4VaultProxyAddress;
  IEnzymeFundValueCalculatorRouter public immutable enzymeFundValueCalculatorRouter;
  uint public immutable minPoolEth;

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint public constant MAX_SLIPPAGE_DENOMINATOR = 10000;
  uint public constant MIN_VALID_TO_PERIOD = 600; // 10 minutes
  uint public constant MAX_VALID_TO_PERIOD = 3600; // 60 minutes
  uint public constant MIN_TIME_BETWEEN_ORDERS = 900; // 15 minutes
  uint public constant maxFee = 0.3 ether;

  modifier onlyController() {
    require(msg.sender == swapController, "SwapOp: only controller can execute");
    _;
  }

  /// @param _cowSettlement Address of CoW protocol's settlement contract
  /// @param _swapController Account allowed to place and close orders
  /// @param _master Address of Nexus' master contract
  /// @param _weth Address of wrapped eth token
  constructor(
    address _cowSettlement,
    address _swapController,
    address _master,
    address _weth,
    address _enzymeV4VaultProxyAddress,
    IEnzymeFundValueCalculatorRouter _enzymeFundValueCalculatorRouter,
    uint _minPoolEth
  ) {
    cowSettlement = ICowSettlement(_cowSettlement);
    cowVaultRelayer = cowSettlement.vaultRelayer();
    master = INXMMaster(_master);
    swapController = _swapController;
    weth = IWeth(_weth);
    domainSeparator = cowSettlement.domainSeparator();
    enzymeV4VaultProxyAddress = _enzymeV4VaultProxyAddress;
    enzymeFundValueCalculatorRouter = _enzymeFundValueCalculatorRouter;
    minPoolEth = _minPoolEth;
  }

  receive() external payable {}

  /// @dev Compute the digest of an order using CoW protocol's logic
  /// @param order The order
  /// @return The digest
  function getDigest(GPv2Order.Data calldata order) public view returns (bytes32) {
    bytes32 hash = GPv2Order.hash(order, domainSeparator);
    return hash;
  }

  /// @dev Compute the UID of an order using CoW protocol's logic
  /// @param order The order
  /// @return The UID (56 bytes)
  function getUID(GPv2Order.Data calldata order) public view returns (bytes memory) {
    bytes memory uid = new bytes(56);
    bytes32 digest = getDigest(order);
    GPv2Order.packOrderUidParams(uid, digest, order.receiver, order.validTo);
    return uid;
  }
  
  /// @dev Using oracle prices, returns the equivalent amount in `toAsset` for a given `fromAssetAmount` in `fromAsset`
  /// Supports conversions for ETH to Asset, Asset to ETH, and Asset to Asset
  function getOracleAmount(address toAsset, address fromAsset, uint fromAssetAmount) internal view returns (uint) {
    IPriceFeedOracle priceFeedOracle = _pool().priceFeedOracle();

    if (fromAsset == address(weth)) {
      // ETH -> toAsset
      return priceFeedOracle.getAssetForEth(toAsset, fromAssetAmount);
    }
    if (toAsset == address(weth)) {
      // fromAsset -> ETH
      return priceFeedOracle.getEthForAsset(fromAsset, fromAssetAmount);
    }
    // fromAsset -> toAsset via ETH
    uint fromAssetInEth = priceFeedOracle.getEthForAsset(fromAsset, fromAssetAmount);
    return priceFeedOracle.getAssetForEth(toAsset, fromAssetInEth);
  }

  /// @dev Validates the amount against the oracle price adjusted with max slippage tolerances
  function verifySlippage(uint amount, uint oracleAmount, uint16 maxSlippageRatio) internal pure {
    // Calculate slippage and minimum amount we should accept
    uint maxSlippageAmount = (oracleAmount * maxSlippageRatio) / MAX_SLIPPAGE_DENOMINATOR;
    uint minBuyAmountOnMaxSlippage = oracleAmount - maxSlippageAmount;
    if (amount < minBuyAmountOnMaxSlippage) {
      revert AmountTooLow(amount, minBuyAmountOnMaxSlippage);
    }
  }

  /// @dev Validates order amounts against oracle prices and slippage limits.
  /// Uses the higher maxSlippageRatio from sell/buySwapDetails, then checks if the swap amount meets the minimum after slippage.
  function validateOrderAmount(SwapOperation memory swapOp) internal view {
    // Determine the higher maxSlippageRatio
    if (swapOp.sellSwapDetails.maxSlippageRatio > swapOp.buySwapDetails.maxSlippageRatio) {
      // verify sellAmount because sellToken maxSlippageRatio is higher
      address fromAsset = address(swapOp.order.buyToken);
      address toAsset = address(swapOp.order.sellToken);
      uint fromAmount = swapOp.order.buyAmount;
      uint amountToCheck = swapOp.order.sellAmount;
      uint16 higherMaxSlippageRatio = swapOp.sellSwapDetails.maxSlippageRatio;
      
      uint oracleAmount = getOracleAmount(toAsset, fromAsset, fromAmount);
      verifySlippage(amountToCheck, oracleAmount, higherMaxSlippageRatio);
    } else {
      // verify buyAmount because buyToken maxSlippageRatio is higher
      address fromAsset = address(swapOp.order.sellToken);
      address toAsset = address(swapOp.order.buyToken);
      uint fromAmount = swapOp.order.sellAmount;
      uint amountToCheck = swapOp.order.buyAmount;
      uint16 higherMaxSlippageRatio = swapOp.buySwapDetails.maxSlippageRatio;

      uint oracleAmount = getOracleAmount(toAsset, fromAsset, fromAmount);
      verifySlippage(amountToCheck, oracleAmount, higherMaxSlippageRatio);
    }
  }
  
  /// @dev Validates if a token is enabled for swapping.
  /// WETH is excluded in validation since it does not have set swapDetails (i.e. SwapDetails(0,0,0,0))
  function validateTokenIsEnabled(address token, SwapDetails memory swapDetails) internal view {
    if (token != address(weth) && swapDetails.minAmount == 0 && swapDetails.maxAmount == 0) {
      revert OrderTokenIsDisabled(token);
    }
  }

  /// @dev Validates minimum pool ETH reserve is not breached after selling ETH
  function validateEthBalance(IPool pool, uint totalOutAmount) internal view {
    uint ethPostSwap = address(pool).balance - totalOutAmount;
    if (ethPostSwap < minPoolEth) {
      revert EthReserveBelowMin(ethPostSwap, minPoolEth);
    }
  }

  /// @dev Validates two conditions:
  /// 1. The current sellToken balance is greater than sellSwapDetails.maxAmount
  /// 2. The post-swap sellToken balance is greater than or equal to sellSwapDetails.minAmount
  /// Skips validation for WETH since it does not have set swapDetails
  function validateSellTokenBalance(IPool pool, SwapOperation memory swapOp, uint totalOutAmount) internal view {
    uint sellTokenBalance = swapOp.order.sellToken.balanceOf(address(pool));

    // skip validation for WETH since it does not have set swapDetails
    if (address(swapOp.order.sellToken) == address(weth)) {
      return;
    }

    if (sellTokenBalance <= swapOp.sellSwapDetails.maxAmount) {
      revert InvalidBalance(sellTokenBalance, swapOp.sellSwapDetails.maxAmount, 'max');
    }
    // NOTE: the totalOutAmount (i.e. sellAmount + fee) is used to get postSellTokenSwapBalance
    uint postSellTokenSwapBalance = sellTokenBalance - totalOutAmount; 
    if (postSellTokenSwapBalance < swapOp.sellSwapDetails.minAmount) {
      revert InvalidPostSwapBalance(postSellTokenSwapBalance, swapOp.sellSwapDetails.minAmount, 'min');
    }      
  }

  /// @dev Validates two conditions:
  /// 1. The current buyToken balance is less than buySwapDetails.minAmount.
  /// 2. The post-swap buyToken balance is less than or equal to buySwapDetails.maxAmount.
  /// Skip validation for WETH since it does not have set swapDetails
  function validateBuyTokenBalance(IPool pool, SwapOperation memory swapOp) internal view {
    uint buyTokenBalance = swapOp.order.buyToken.balanceOf(address(pool));
    
    // skip validation for WETH since it does not have set swapDetails
    if (address(swapOp.order.buyToken) == address(weth)) {
      return;
    }

    if (buyTokenBalance >= swapOp.buySwapDetails.minAmount) {
      revert InvalidBalance(buyTokenBalance, swapOp.buySwapDetails.minAmount, 'min');
    }
    // NOTE: use order.buyAmount to get postBuyTokenSwapBalance
    uint postBuyTokenSwapBalance = buyTokenBalance + swapOp.order.buyAmount; 
    if (postBuyTokenSwapBalance > swapOp.buySwapDetails.maxAmount) {
      revert InvalidPostSwapBalance(postBuyTokenSwapBalance, swapOp.buySwapDetails.maxAmount, 'max');
    }
  }

  /// @dev Helper function to determine the SwapOperationType of the order
  function getSwapOperationType(GPv2Order.Data memory order) internal view returns (SwapOperationType) {
    if (address(order.sellToken) == address(weth)) {
      return SwapOperationType.WethToAsset;
    }
    if (address(order.buyToken) == address(weth)) {
      return SwapOperationType.AssetToWeth;
    }
    return SwapOperationType.AssetToAsset;
  }

  /// @dev NOTE: for assets that does not have any set swapDetails such as WETH it will have SwapDetails(0,0,0,0)
  function prepareSwapDetails(IPool pool, GPv2Order.Data calldata order) internal view returns (SwapOperation memory) {
    SwapDetails memory sellSwapDetails = pool.getAssetSwapDetails(address(order.sellToken));
    SwapDetails memory buySwapDetails = pool.getAssetSwapDetails(address(order.buyToken));

    return SwapOperation({
        order: order,
        sellSwapDetails: sellSwapDetails,
        buySwapDetails: buySwapDetails,
        swapType: getSwapOperationType(order)
    });
  }

  /// @dev Performs pre-swap validation checks for a given swap operation
  function performPreSwapValidations(IPool pool, SwapOperation memory swapOp, uint totalOutAmount) internal view {
    address sellTokenAddress = address(swapOp.order.sellToken);
    address buyTokenAddress = address(swapOp.order.buyToken);

    // validate both sell and buy tokens are enabled
    validateTokenIsEnabled(sellTokenAddress, swapOp.sellSwapDetails);
    validateTokenIsEnabled(buyTokenAddress, swapOp.buySwapDetails);

    // validate ETH balance is within ETH reserves after the swap
    if (swapOp.swapType == SwapOperationType.WethToAsset) {
      validateEthBalance(pool, totalOutAmount);
    }
    
    // validate sell/buy token balances against swapDetails min/max
    validateSellTokenBalance(pool, swapOp, totalOutAmount);
    validateBuyTokenBalance(pool, swapOp);

    // validate swap frequency to enforce cool down periods
    validateSwapFrequency(swapOp.sellSwapDetails);
    validateSwapFrequency(swapOp.buySwapDetails);

    // validate max fee and max slippage
    validateMaxFee(sellTokenAddress, swapOp.order.feeAmount);
    validateOrderAmount(swapOp);
  }

  /// @dev Executes asset transfers from Pool to SwapOperator for CoW Swap order executions
  /// Additionally if selling ETH, wraps received Pool ETH to WETH
  function executeAssetTransfer(IPool pool, SwapOperation memory swapOp, uint totalOutAmount) internal returns (uint swapValueEth) {
    IPriceFeedOracle priceFeedOracle = pool.priceFeedOracle();
    address sellTokenAddress = address(swapOp.order.sellToken);
    address buyTokenAddress = address(swapOp.order.buyToken);

    if (swapOp.swapType == SwapOperationType.WethToAsset) {
        // set lastSwapTime of buyToken only (sellToken WETH has no set swapDetails)
        pool.setSwapDetailsLastSwapTime(buyTokenAddress, uint32(block.timestamp));
        // transfer ETH from pool and wrap it (use ETH address here because swapOp.sellToken is WETH address)
        pool.transferAssetToSwapOperator(ETH, totalOutAmount);
        weth.deposit{value: totalOutAmount}();
        // no need to convert since totalOutAmount is already in ETH (i.e. WETH)
        swapValueEth = totalOutAmount;
    } else if (swapOp.swapType == SwapOperationType.AssetToWeth) {
        // set lastSwapTime of sellToken only (buyToken WETH has no set swapDetails)
        pool.setSwapDetailsLastSwapTime(sellTokenAddress, uint32(block.timestamp));
        // transfer ERC20 asset from Pool
        pool.transferAssetToSwapOperator(sellTokenAddress, totalOutAmount);
        // convert totalOutAmount (sellAmount + fee) to ETH
        swapValueEth = priceFeedOracle.getEthForAsset(sellTokenAddress, totalOutAmount);
    } else { // SwapOperationType.AssetToAsset
        // set lastSwapTime of sell / buy tokens
        pool.setSwapDetailsLastSwapTime(sellTokenAddress, uint32(block.timestamp));
        pool.setSwapDetailsLastSwapTime(buyTokenAddress, uint32(block.timestamp));
        // transfer ERC20 asset from Pool
        pool.transferAssetToSwapOperator(sellTokenAddress, totalOutAmount);
        // convert totalOutAmount (sellAmount + fee) to ETH
        swapValueEth = priceFeedOracle.getEthForAsset(sellTokenAddress, totalOutAmount);
    }

    return swapValueEth;
  }

  /// @dev Approve a given order to be executed, by presigning it on CoW protocol's settlement contract
  /// Validates the order before the sellToken is transferred from the Pool to the SwapOperator for the CoW swap operation
  /// Emits OrderPlaced event on success. Only one order can be open at the same time
  /// NOTE: ETH orders are expected to have a WETH address because ETH will be eventually converted to WETH to do the swap
  /// @param order - The order to be placed
  /// @param orderUID - the UID of the of the order to be placed
  function placeOrder(GPv2Order.Data calldata order, bytes calldata orderUID) public onlyController {
    if (orderInProgress()) {
      revert OrderInProgress(currentOrderUID);
    }

    // Order UID and basic CoW params validations
    validateUID(order, orderUID);
    validateBasicCowParams(order);

    IPool pool = _pool();
    uint totalOutAmount = order.sellAmount + order.feeAmount;

    // Prepare swap details
    SwapOperation memory swapOp = prepareSwapDetails(pool, order);

    // Perform validations
    performPreSwapValidations(pool, swapOp, totalOutAmount);

    // Execute swap based on operation type
    uint swapValueEth = executeAssetTransfer(pool, swapOp, totalOutAmount);

    // Set the swapValue on the pool
    pool.setSwapValue(swapValueEth);

    // Approve cowVaultRelayer contract to spend sellToken totalOutAmount
    order.sellToken.safeApprove(cowVaultRelayer, totalOutAmount);

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
  function closeOrder(GPv2Order.Data calldata order) external {
    // Validate there is an order in place
    require(orderInProgress(), "SwapOp: No order in place");

    // Before validTo, only controller can call this. After it, everyone can call
    if (block.timestamp <= order.validTo) {
      require(msg.sender == swapController, "SwapOp: only controller can execute");
    }

    validateUID(order, currentOrderUID);

    // Check how much of the order was filled, and if it was fully filled
    uint filledAmount = cowSettlement.filledAmount(currentOrderUID);

    // Cancel order and unapprove tokens
    cowSettlement.invalidateOrder(currentOrderUID);
    order.sellToken.safeApprove(cowVaultRelayer, 0);

    // Clear the current order
    delete currentOrderUID;

    // Withdraw both buyToken and sellToken
    returnAssetToPool(order.buyToken);
    returnAssetToPool(order.sellToken);

    // Set swapValue on pool to 0
    _pool().setSwapValue(0);

    // Emit event
    emit OrderClosed(order, filledAmount);
  }

  /// @dev Return a given asset to the pool, either ETH or ERC20
  /// @param asset The asset
  function returnAssetToPool(IERC20 asset) internal {
    uint balance = asset.balanceOf(address(this));

    if (balance == 0) {
      return;
    }

    if (address(asset) == address(weth)) {
      // Unwrap WETH
      weth.withdraw(balance);

      // Transfer ETH to pool
      (bool sent, ) = payable(address(_pool())).call{value: balance}("");
      require(sent, "SwapOp: Failed to send Ether to pool");
    } else {
      // Transfer ERC20 to pool
      asset.safeTransfer(address(_pool()), balance);
    }
  }

  /// @dev General validations on individual order fields
  /// @param order The order
  function validateBasicCowParams(GPv2Order.Data calldata order) internal view {
    uint minValidTo = block.timestamp + MIN_VALID_TO_PERIOD;
    uint maxValidTo = block.timestamp + MAX_VALID_TO_PERIOD;

    if (order.validTo < minValidTo) {
      revert BelowMinValidTo(minValidTo);
    }
    if (order.validTo > maxValidTo) {
      revert AboveMaxValidTo(maxValidTo);
    }
    if (order.receiver != address(this)) {
      revert InvalidReceiver(address(this));      
    }
    if (order.sellTokenBalance != GPv2Order.BALANCE_ERC20) {
      revert UnsupportedTokenBalance('sell');
    }
    if (order.buyTokenBalance != GPv2Order.BALANCE_ERC20) {
      revert UnsupportedTokenBalance('buy');
    }
  }

  /// @dev Validate that a given UID is the correct one for a given order
  /// @param order The order
  /// @param providedOrderUID The UID
  function validateUID(GPv2Order.Data calldata order, bytes memory providedOrderUID) internal view {
    bytes memory calculatedOrderUID = getUID(order);
    if (keccak256(calculatedOrderUID) != keccak256(providedOrderUID)) {
      revert OrderUidMismatch(providedOrderUID, calculatedOrderUID);
    }
  }

  /// @dev Get the Pool's instance through master contract
  /// @return The pool instance
  function _pool() internal view returns (IPool) {
    return IPool(master.getLatestAddress("P1"));
  }

  /// @dev Validates that a given asset is not swapped too fast
  /// @param swapDetails Swap details for the given asset
  function validateSwapFrequency(SwapDetails memory swapDetails) internal view {
    uint minValidSwapTime = swapDetails.lastSwapTime + MIN_TIME_BETWEEN_ORDERS; 
    if (block.timestamp < minValidSwapTime) {
      revert InsufficientTimeBetweenSwaps(minValidSwapTime);      
    }
  }

  /// @dev Validate that the fee for the order is not higher than the maximum allowed fee, in ether
  /// @param sellToken The sell asset
  /// @param feeAmount The fee (will always be denominated in the sell asset units)
  function validateMaxFee(
    address sellToken,
    uint feeAmount
  ) internal view {
    uint feeInEther = sellToken == address(weth)
      ? feeAmount
      : _pool().priceFeedOracle().getEthForAsset(sellToken, feeAmount);
    if (feeInEther > maxFee) {
      revert AboveMaxFee(feeInEther, maxFee);
    }
  }

  /// @dev Exchanges ETH for Enzyme Vault shares with slippage control. Emits `Swapped` on success
  /// @param amountIn Amount of ETH to be swapped for Enzyme Vault shares
  /// @param amountOutMin Minimum Enzyme Vault shares out expected
  function swapETHForEnzymeVaultShare(uint amountIn, uint amountOutMin) external onlyController {

    // Validate there's no current cow swap order going on
    require(!orderInProgress(), "SwapOp: an order is already in place");

    IPool pool = _pool();
    IEnzymeV4Comptroller comptrollerProxy = IEnzymeV4Comptroller(IEnzymeV4Vault(enzymeV4VaultProxyAddress).getAccessor());
    IERC20Detailed toToken = IERC20Detailed(enzymeV4VaultProxyAddress);


    SwapDetails memory swapDetails = pool.getAssetSwapDetails(address(toToken));

    require(!(swapDetails.minAmount == 0 && swapDetails.maxAmount == 0), "SwapOp: asset is not enabled");

    {
      // scope for swap frequency check
      uint timeSinceLastTrade = block.timestamp - uint(swapDetails.lastSwapTime);
      require(timeSinceLastTrade > MIN_TIME_BETWEEN_ORDERS, "SwapOp: too fast");
    }

    {
      // check slippage
      (, uint netShareValue) = enzymeFundValueCalculatorRouter.calcNetShareValue(enzymeV4VaultProxyAddress);

      uint avgAmountOut = amountIn * 1e18 / netShareValue;
      uint maxSlippageAmount = avgAmountOut * swapDetails.maxSlippageRatio / MAX_SLIPPAGE_DENOMINATOR;
      uint minOutOnMaxSlippage = avgAmountOut - maxSlippageAmount;

      require(amountOutMin >= minOutOnMaxSlippage, "SwapOp: amountOutMin < minOutOnMaxSlippage");
    }

    uint balanceBefore = toToken.balanceOf(address(pool));
    pool.transferAssetToSwapOperator(ETH, amountIn);

    require(comptrollerProxy.getDenominationAsset() == address(weth), "SwapOp: invalid denomination asset");

    weth.deposit{ value: amountIn }();
    weth.approve(address(comptrollerProxy), amountIn);
    comptrollerProxy.buyShares(amountIn, amountOutMin);

    pool.setSwapDetailsLastSwapTime(address(toToken), uint32(block.timestamp));

    uint amountOut = toToken.balanceOf(address(this));

    require(amountOut >= amountOutMin, "SwapOp: amountOut < amountOutMin");
    require(balanceBefore < swapDetails.minAmount, "SwapOp: balanceBefore >= min");
    require(balanceBefore + amountOutMin <= swapDetails.maxAmount, "SwapOp: balanceAfter > max");

    {
      uint ethBalanceAfter = address(pool).balance;
      require(ethBalanceAfter >= minPoolEth, "SwapOp: insufficient ether left");
    }

    transferAssetTo(enzymeV4VaultProxyAddress, address(pool), amountOut);

    emit Swapped(ETH, enzymeV4VaultProxyAddress, amountIn, amountOut);
  }

  /// @dev Exchanges Enzyme Vault shares for ETH with slippage control. Emits `Swapped` on success
  /// @param amountIn Amount of Enzyme Vault shares to be swapped for ETH
  /// @param amountOutMin Minimum ETH out expected
  function swapEnzymeVaultShareForETH(
    uint amountIn,
    uint amountOutMin
  ) external onlyController {

    // Validate there's no current cow swap order going on
    require(!orderInProgress(), "SwapOp: an order is already in place");

    IPool pool = _pool();
    IERC20Detailed fromToken = IERC20Detailed(enzymeV4VaultProxyAddress);

    uint balanceBefore = fromToken.balanceOf(address(pool));
    {

      SwapDetails memory swapDetails = pool.getAssetSwapDetails(address(fromToken));

      require(!(swapDetails.minAmount == 0 && swapDetails.maxAmount == 0), "SwapOp: asset is not enabled");

      // swap frequency check
      uint timeSinceLastTrade = block.timestamp - uint(swapDetails.lastSwapTime);
      require(timeSinceLastTrade > MIN_TIME_BETWEEN_ORDERS, "SwapOp: too fast");

      uint netShareValue;
      {
        address denominationAsset;
        (denominationAsset, netShareValue) =
        enzymeFundValueCalculatorRouter.calcNetShareValue(enzymeV4VaultProxyAddress);

        require(denominationAsset ==  address(weth), "SwapOp: invalid denomination asset");
      }

      // avgAmountOut in ETH
      uint avgAmountOut = amountIn * netShareValue / (10 ** fromToken.decimals());
      uint maxSlippageAmount = avgAmountOut * swapDetails.maxSlippageRatio / MAX_SLIPPAGE_DENOMINATOR;
      uint minOutOnMaxSlippage = avgAmountOut - maxSlippageAmount;

      // slippage check
      require(amountOutMin >= minOutOnMaxSlippage, "SwapOp: amountOutMin < minOutOnMaxSlippage");
      require(balanceBefore > swapDetails.maxAmount, "SwapOp: balanceBefore <= max");
      require(balanceBefore - amountIn >= swapDetails.minAmount, "SwapOp: tokenBalanceAfter < min");
    }

    pool.transferAssetToSwapOperator(address(fromToken), amountIn);

    IEnzymeV4Comptroller comptrollerProxy = IEnzymeV4Comptroller(IEnzymeV4Vault(enzymeV4VaultProxyAddress).getAccessor());
    fromToken.approve(address(comptrollerProxy), amountIn);

    address[] memory payoutAssets = new address[](1);
    uint[] memory payoutAssetsPercentages = new uint[](1);

    payoutAssets[0] = address(weth);
    payoutAssetsPercentages[0] = 10000;

    comptrollerProxy.redeemSharesForSpecificAssets(address(this), amountIn, payoutAssets, payoutAssetsPercentages);

    uint amountOut = weth.balanceOf(address(this));
    weth.withdraw(amountOut);

    pool.setSwapDetailsLastSwapTime(address(fromToken), uint32(block.timestamp));

    require(amountOut >= amountOutMin, "SwapOp: amountOut < amountOutMin");

    transferAssetTo(ETH, address(pool), amountOut);

    emit Swapped(enzymeV4VaultProxyAddress, ETH, amountIn, amountOut);
  }

  function transferAssetTo (address asset, address to, uint amount) internal {

    if (asset == ETH) {
      (bool ok, /* data */) = to.call{ value: amount }("");
      require(ok, "SwapOp: Eth transfer failed");
      return;
    }

    IERC20 token = IERC20(asset);
    token.safeTransfer(to, amount);
  }

  /// @dev Recovers assets in the SwapOperator to the pool or a specified receiver, ensuring no ongoing CoW swap orders
  /// @param assetAddress Address of the asset to recover
  /// @param receiver Address to receive the recovered assets, if asset is not supported by the pool
  function recoverAsset(address assetAddress, address receiver) public onlyController {

    // Validate there's no current cow swap order going on
    require(!orderInProgress(), "SwapOp: an order is already in place");

    IPool pool = _pool();

    if (assetAddress == ETH) {
      uint ethBalance = address(this).balance;
      require(ethBalance > 0, "SwapOp: ETH balance to recover is 0");

      // We assume ETH is always supported so we directly transfer it back to the Pool
      (bool sent, ) = payable(address(pool)).call{value: ethBalance}("");
      require(sent, "SwapOp: Failed to send Ether to pool");

      return;
    }

    IERC20 asset = IERC20(assetAddress);

    uint balance = asset.balanceOf(address(this));
    require(balance > 0, "SwapOp: Balance = 0");

    SwapDetails memory swapDetails = pool.getAssetSwapDetails(assetAddress);

    if (swapDetails.minAmount == 0 && swapDetails.maxAmount == 0) {
      // asset is not supported
      asset.transfer(receiver, balance);
      return;
    }

    asset.transfer(address(pool), balance);
  }

  /// @dev Checks if there is an ongoing order
  /// @return bool True if an order is currently in progress, otherwise false
  function orderInProgress() public view returns (bool) {
    return currentOrderUID.length > 0;
  }
}
