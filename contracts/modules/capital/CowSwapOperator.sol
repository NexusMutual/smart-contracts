// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import "../../external/cow/GPv2Order.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/utils/math/Math.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IWeth.sol";
import "../../interfaces/ICowSettlement.sol";
import "../../interfaces/IPriceFeedOracle.sol";

contract CowSwapOperator {
  // Storage
  ICowSettlement public immutable cowSettlement;
  address public immutable cowVaultRelayer;
  INXMMaster public immutable master;
  address public immutable swapController;
  IWeth public immutable weth;
  IPriceFeedOracle public immutable priceFeedOracle;
  bytes public currentOrderUID;
  bytes32 public immutable domainSeparator;

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint16 constant MAX_SLIPPAGE_DENOMINATOR = 10000;

  event OrderPlaced(GPv2Order.Data order);
  event OrderClosed(GPv2Order.Data order, uint256 filledAmount);

  modifier onlyController() {
    require(msg.sender == swapController, "SwapOp: only controller can execute");
    _;
  }

  constructor(
    address _cowSettlement,
    address _swapController,
    address _master,
    address _weth,
    address _priceFeedOracle
  ) {
    cowSettlement = ICowSettlement(_cowSettlement);
    cowVaultRelayer = cowSettlement.vaultRelayer();
    master = INXMMaster(_master);
    swapController = _swapController;
    weth = IWeth(_weth);
    priceFeedOracle = IPriceFeedOracle(_priceFeedOracle);
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

    // Validate feeAmount is not too high
    require(order.sellAmount / order.feeAmount >= 100, "SwapOp: Fee is above 1% of sellAmount");

    // Validate swapping is enabled for sellToken (eth always enabled)
    IPool pool = _pool();
    IPool.SwapDetails memory sellTokenDetails = pool.getAssetSwapDetails(address(order.sellToken));
    uint256 totalOutAmount = orderOutAmount(order);
    if (!isSellingEth(order)) {
      require(sellTokenDetails.minAmount != 0 || sellTokenDetails.maxAmount != 0, "SwapOp: sellToken is not enabled");
      uint256 sellTokenBalance = order.sellToken.balanceOf(address(pool));
      require(sellTokenBalance > sellTokenDetails.maxAmount, "SwapOp: can only sell asset when > maxAmount");
      require(
        sellTokenBalance - totalOutAmount >= sellTokenDetails.minAmount,
        "SwapOp: swap brings sellToken below min"
      );
    }

    // Validate swapping is enabled for buyToken (eth always enabled)
    IPool.SwapDetails memory buyTokenDetails = pool.getAssetSwapDetails(address(order.buyToken));
    if (!isBuyingEth(order)) {
      // Eth is always enabled
      require(buyTokenDetails.minAmount != 0 || buyTokenDetails.maxAmount != 0, "SwapOp: buyToken is not enabled");
      uint256 buyTokenBalance = order.buyToken.balanceOf(address(pool));
      require(buyTokenBalance < buyTokenDetails.minAmount, "SwapOp: can only buy asset when < minAmount");
      require(buyTokenBalance + order.buyAmount <= buyTokenDetails.maxAmount, "SwapOp: swap brings buyToken above max");
    }

    // Validate minimum pool eth reserve
    if (isSellingEth(order)) {
      require(address(pool).balance - totalOutAmount >= pool.minPoolEth(), "SwapOp: Pool eth balance below min");
    }

    // Validate oracle price
    uint256 finalSlippage = Math.max(buyTokenDetails.maxSlippageRatio, sellTokenDetails.maxSlippageRatio);
    if (isSellingEth(order)) {
      // Ask oracle how much of the other asset we should get
      uint256 oracleBuyAmount = priceFeedOracle.getAssetForEth(address(order.buyToken), order.sellAmount);

      // Calculate slippage and minimum amount we should accept
      uint256 maxSlippageAmount = (oracleBuyAmount * finalSlippage) / MAX_SLIPPAGE_DENOMINATOR;
      uint256 minBuyAmountOnMaxSlippage = oracleBuyAmount - maxSlippageAmount;

      require(order.buyAmount >= minBuyAmountOnMaxSlippage, "SwapOp: order.buyAmount too low (oracle)");
    } else if (isBuyingEth(order)) {
      // Ask oracle how much ether we should get
      uint256 oracleBuyAmount = priceFeedOracle.getEthForAsset(address(order.sellToken), order.sellAmount);

      // Calculate slippage and minimum amount we should accept
      uint256 maxSlippageAmount = (oracleBuyAmount * finalSlippage) / MAX_SLIPPAGE_DENOMINATOR;
      uint256 minBuyAmountOnMaxSlippage = oracleBuyAmount - maxSlippageAmount;

      require(order.buyAmount >= minBuyAmountOnMaxSlippage, "SwapOp: order.buyAmount too low (oracle)");
    } else {
      revert("SwapOp: Must either sell or buy eth");
    }

    // Transfer pool's asset to this contract; wrap ether if needed
    if (isSellingEth(order)) {
      pool.transferAssetToSwapOperator(ETH, totalOutAmount);
      weth.deposit{value: totalOutAmount}();
      pool.setSwapValue(totalOutAmount);
    } else {
      pool.transferAssetToSwapOperator(address(order.sellToken), totalOutAmount);

      // Calculate swapValue for non-eth asset
      uint256 swapValue = priceFeedOracle.getEthForAsset(address(order.sellToken), totalOutAmount);
      pool.setSwapValue(swapValue);
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

  function closeOrder(GPv2Order.Data calldata order) external onlyController {
    // Validate there is an order in place
    require(currentOrderUID.length > 0, "SwapOp: No order in place");

    validateUID(order, currentOrderUID);

    // Check how much of the order was filled, and if it was fully filled
    uint256 filledAmount = cowSettlement.filledAmount(currentOrderUID);
    bool fullyFilled = filledAmount == order.sellAmount;

    // Cancel signature and unapprove tokens
    if (!fullyFilled) {
      cowSettlement.setPreSignature(currentOrderUID, false);
      approveVaultRelayer(order.sellToken, 0);
    }

    // Clear the current order
    delete currentOrderUID;

    // Withdraw buyToken if there's any remaining
    uint256 buyTokenBalance = order.buyToken.balanceOf(address(this));
    if (buyTokenBalance > 0) {
      if (isBuyingEth(order)) {
        weth.withdraw(buyTokenBalance); // unwrap purchased WETH
        payable(address(_pool())).transfer(buyTokenBalance);
      } else {
        order.buyToken.transfer(address(_pool()), buyTokenBalance);
      }
    }

    // Withdraw sellToken if there's any remaining
    uint256 sellTokenBalance = order.sellToken.balanceOf(address(this));
    if (sellTokenBalance > 0) {
      if (isSellingEth(order)) {
        weth.withdraw(sellTokenBalance); // unwrap unsold WETH
        payable(address(_pool())).transfer(sellTokenBalance);
      } else {
        order.sellToken.transfer(address(_pool()), sellTokenBalance);
      }
    }

    // Set swapValue on pool to 0
    _pool().setSwapValue(0);

    // Emit event
    emit OrderClosed(order, filledAmount);
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
    require(order.kind == GPv2Order.KIND_SELL, "SwapOp: Only sell operations are supported");
    require(order.receiver == address(this), "SwapOp: Receiver must be this contract");
    require(order.validTo >= block.timestamp + 600, "SwapOp: validTo must be at least 10 minutes in the future");
  }

  function approveVaultRelayer(IERC20 token, uint256 amount) internal {
    token.approve(cowVaultRelayer, amount); // infinite approval
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

  function orderOutAmount(GPv2Order.Data calldata order) internal pure returns (uint256) {
    return order.sellAmount + order.feeAmount;
  }
}
