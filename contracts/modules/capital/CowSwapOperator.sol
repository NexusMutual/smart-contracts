// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import "../../external/cow/GPv2Order.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/utils/math/Math.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IWeth.sol";
import "../../interfaces/ICowSettlement.sol";
import "../../interfaces/IPriceFeedOracle.sol";

contract CowSwapOperator {
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

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint16 public constant MAX_SLIPPAGE_DENOMINATOR = 10000;
  uint public constant MIN_VALID_TO_PERIOD = 600; // 10 minutes
  uint public constant MAX_VALID_TO_PERIOD = 3600; // 60 minutes
  uint public constant MIN_SELL_AMT_TO_FEE_RATIO = 100; // Sell amount at least 100x fee amount
  uint public constant MIN_TIME_BETWEEN_ORDERS = 900; // 15 minutes
  uint public constant maxFee = 0.3 ether;

  // Events
  event OrderPlaced(GPv2Order.Data order);
  event OrderClosed(GPv2Order.Data order, uint filledAmount);

  /// Fee too high: `current`. Max is `maxFee`
  /// @param current actual fee
  /// @param maxFee maximum allowed fee
  error FeeTooHigh(uint current, uint maxFee);

  modifier onlyController() {
    require(msg.sender == swapController, "SwapOp: only controller can execute");
    _;
  }

  constructor(
    address _cowSettlement,
    address _swapController,
    address _master,
    address _weth
  ) {
    cowSettlement = ICowSettlement(_cowSettlement);
    cowVaultRelayer = cowSettlement.vaultRelayer();
    master = INXMMaster(_master);
    swapController = _swapController;
    weth = IWeth(_weth);
    domainSeparator = cowSettlement.domainSeparator();
  }

  receive() external payable {}

  function getDigest(GPv2Order.Data calldata order) public view returns (bytes32) {
    bytes32 hash = GPv2Order.hash(order, domainSeparator);
    return hash;
  }

  function getUID(GPv2Order.Data calldata order) public view returns (bytes memory) {
    bytes memory uid = new bytes(56);
    bytes32 digest = getDigest(order);
    GPv2Order.packOrderUidParams(uid, digest, order.receiver, order.validTo);
    return uid;
  }

  function placeOrder(GPv2Order.Data calldata order, bytes calldata orderUID) public onlyController {
    // Validate there's no current order going on
    require(currentOrderUID.length == 0, "SwapOp: an order is already in place");

    // Order UID verification
    validateUID(order, orderUID);

    // Validate basic CoW params
    validateBasicCowParams(order);

    IPool pool = _pool();
    IPriceFeedOracle priceFeedOracle = pool.priceFeedOracle();
    uint totalOutAmount = order.sellAmount + order.feeAmount;

    if (isSellingEth(order)) {
      // Validate min/max setup for buyToken
      IPool.SwapDetails memory swapDetails = pool.getAssetSwapDetails(address(order.buyToken));
      require(swapDetails.minAmount != 0 || swapDetails.maxAmount != 0, "SwapOp: buyToken is not enabled");
      uint buyTokenBalance = order.buyToken.balanceOf(address(pool));
      require(buyTokenBalance < swapDetails.minAmount, "SwapOp: can only buy asset when < minAmount");
      require(buyTokenBalance + order.buyAmount <= swapDetails.maxAmount, "SwapOp: swap brings buyToken above max");

      validateSwapFrequency(swapDetails);

      validateMaxFee(priceFeedOracle, ETH, order.feeAmount);

      // Validate minimum pool eth reserve
      require(address(pool).balance - totalOutAmount >= pool.minPoolEth(), "SwapOp: Pool eth balance below min");

      // Ask oracle how much of the other asset we should get
      uint oracleBuyAmount = priceFeedOracle.getAssetForEth(address(order.buyToken), order.sellAmount);

      // Calculate slippage and minimum amount we should accept
      uint maxSlippageAmount = (oracleBuyAmount * swapDetails.maxSlippageRatio) / MAX_SLIPPAGE_DENOMINATOR;
      uint minBuyAmountOnMaxSlippage = oracleBuyAmount - maxSlippageAmount;

      require(order.buyAmount >= minBuyAmountOnMaxSlippage, "SwapOp: order.buyAmount too low (oracle)");

      refreshAssetLastSwapDate(pool, address(order.buyToken));

      // Transfer ETH from pool and wrap it
      pool.transferAssetToSwapOperator(ETH, totalOutAmount);
      weth.deposit{value: totalOutAmount}();

      // Set pool's swapValue
      pool.setSwapValue(totalOutAmount);
    } else if (isBuyingEth(order)) {
      // Validate min/max setup for sellToken
      IPool.SwapDetails memory swapDetails = pool.getAssetSwapDetails(address(order.sellToken));
      require(swapDetails.minAmount != 0 || swapDetails.maxAmount != 0, "SwapOp: sellToken is not enabled");
      uint sellTokenBalance = order.sellToken.balanceOf(address(pool));
      require(sellTokenBalance > swapDetails.maxAmount, "SwapOp: can only sell asset when > maxAmount");
      require(sellTokenBalance - totalOutAmount >= swapDetails.minAmount, "SwapOp: swap brings sellToken below min");

      validateSwapFrequency(swapDetails);

      validateMaxFee(priceFeedOracle, address(order.sellToken), order.feeAmount);

      // Ask oracle how much ether we should get
      uint oracleBuyAmount = priceFeedOracle.getEthForAsset(address(order.sellToken), order.sellAmount);

      // Calculate slippage and minimum amount we should accept
      uint maxSlippageAmount = (oracleBuyAmount * swapDetails.maxSlippageRatio) / MAX_SLIPPAGE_DENOMINATOR;
      uint minBuyAmountOnMaxSlippage = oracleBuyAmount - maxSlippageAmount;
      require(order.buyAmount >= minBuyAmountOnMaxSlippage, "SwapOp: order.buyAmount too low (oracle)");

      refreshAssetLastSwapDate(pool, address(order.sellToken));

      // Transfer ERC20 asset from Pool
      pool.transferAssetToSwapOperator(address(order.sellToken), totalOutAmount);

      // Calculate swapValue using oracle and set it on the pool
      uint swapValue = priceFeedOracle.getEthForAsset(address(order.sellToken), totalOutAmount);
      pool.setSwapValue(swapValue);
    } else {
      revert("SwapOp: Must either sell or buy eth");
    }

    // Approve Cow's contract to spend sellToken
    approveVaultRelayer(order.sellToken, totalOutAmount);

    // Store the order UID
    currentOrderUID = orderUID;

    // Sign the Cow order
    cowSettlement.setPreSignature(orderUID, true);

    // Emit an event
    emit OrderPlaced(order);
  }

  function closeOrder(GPv2Order.Data calldata order) external {
    // Validate there is an order in place
    require(currentOrderUID.length > 0, "SwapOp: No order in place");

    // Before validTo, only controller can call this. After it, everyone can call
    if (block.timestamp <= order.validTo) {
      require(msg.sender == swapController, "SwapOp: only controller can execute");
    }

    validateUID(order, currentOrderUID);

    // Check how much of the order was filled, and if it was fully filled
    uint filledAmount = cowSettlement.filledAmount(currentOrderUID);
    bool fullyFilled = filledAmount == order.sellAmount;

    // Cancel signature and unapprove tokens
    if (!fullyFilled) {
      cowSettlement.setPreSignature(currentOrderUID, false);
    }

    // Clear allowance
    approveVaultRelayer(order.sellToken, 0);

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
      require(sent, "Failed to send Ether");
    } else {
      // Transfer ERC20 to pool
      asset.safeTransfer(address(_pool()), balance);
    }
  }

  function isSellingEth(GPv2Order.Data calldata order) internal view returns (bool) {
    return address(order.sellToken) == address(weth);
  }

  function isBuyingEth(GPv2Order.Data calldata order) internal view returns (bool) {
    return address(order.buyToken) == address(weth);
  }

  function validateBasicCowParams(GPv2Order.Data calldata order) internal view {
    require(order.sellTokenBalance == GPv2Order.BALANCE_ERC20, "SwapOp: Only erc20 supported for sellTokenBalance");
    require(order.buyTokenBalance == GPv2Order.BALANCE_ERC20, "SwapOp: Only erc20 supported for buyTokenBalance");
    require(order.receiver == address(this), "SwapOp: Receiver must be this contract");
    require(
      order.validTo >= block.timestamp + MIN_VALID_TO_PERIOD,
      "SwapOp: validTo must be at least 10 minutes in the future"
    );
    require(
      order.validTo <= block.timestamp + MAX_VALID_TO_PERIOD,
      "SwapOp: validTo must be at most 60 minutes in the future"
    );
  }

  function approveVaultRelayer(IERC20 token, uint amount) internal {
    token.safeApprove(cowVaultRelayer, amount);
  }

  function validateUID(GPv2Order.Data calldata order, bytes memory providedOrderUID) internal view {
    bytes memory calculatedUID = getUID(order);
    require(
      keccak256(calculatedUID) == keccak256(providedOrderUID),
      "SwapOp: Provided UID doesnt match calculated UID"
    );
  }

  function _pool() internal view returns (IPool) {
    return IPool(master.getLatestAddress("P1"));
  }

  function validateSwapFrequency(IPool.SwapDetails memory swapDetails) internal view {
    require(
      block.timestamp >= swapDetails.lastSwapTime + MIN_TIME_BETWEEN_ORDERS,
      "SwapOp: already swapped this asset recently"
    );
  }

  function refreshAssetLastSwapDate(IPool pool, address asset) internal {
    pool.setSwapDetailsLastSwapTime(asset, uint32(block.timestamp));
  }

  function validateMaxFee(
    IPriceFeedOracle oracle,
    address asset,
    uint feeAmount
  ) internal view {
    uint feeInEther = oracle.getEthForAsset(asset, feeAmount);
    if (feeInEther > maxFee) {
      revert FeeTooHigh(feeInEther, maxFee);
    }
  }
}
