// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import '../../external/cow/GPv2Order.sol';
import '@openzeppelin/contracts-v4/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts-v4/utils/math/Math.sol';
import '../../interfaces/INXMMaster.sol';
import '../../interfaces/IPool.sol';
import '../../interfaces/IWeth.sol';
import '../../interfaces/ICowSettlement.sol';
import '../../interfaces/ITwapOracle.sol';

contract CowSwapOperator {
  // Storage
  ICowSettlement public immutable cowSettlement;
  address public immutable cowVaultRelayer;
  INXMMaster public immutable master;
  address public immutable swapController;
  IWeth public immutable weth;
  ITwapOracle public immutable twapOracle;
  bytes public currentOrderUID;

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint16 constant MAX_SLIPPAGE_DENOMINATOR = 10000;

  event OrderPlaced(GPv2Order.Data order);
  event OrderClosed(GPv2Order.Data order, uint256 filledAmount);

  modifier onlyController() {
    require(msg.sender == swapController, 'SwapOp: only controller can execute');
    _;
  }

  constructor(
    address _cowSettlement,
    address _swapController,
    address _master,
    address _weth,
    address _twapOracle
  ) {
    cowSettlement = ICowSettlement(_cowSettlement);
    cowVaultRelayer = cowSettlement.vaultRelayer();
    master = INXMMaster(_master);
    swapController = _swapController;
    weth = IWeth(_weth);
    twapOracle = ITwapOracle(_twapOracle);
  }

  receive() external payable {}

  function getDigest(GPv2Order.Data calldata order, bytes32 domainSeparator) public pure returns (bytes32) {
    bytes32 hash = GPv2Order.hash(order, domainSeparator);
    return hash;
  }

  function getUID(GPv2Order.Data calldata order, bytes32 domainSeparator) public pure returns (bytes memory) {
    bytes memory uid = new bytes(56);
    bytes32 digest = getDigest(order, domainSeparator);
    GPv2Order.packOrderUidParams(uid, digest, order.receiver, order.validTo);
    return uid;
  }

  function placeOrder(
    GPv2Order.Data calldata order,
    bytes32 domainSeparator,
    bytes calldata orderUID
  ) public onlyController {
    // Validate there's no current order going on
    require(currentOrderUID.length == 0, 'SwapOp: an order is already in place');

    // Order UID verification
    validateUID(order, domainSeparator, orderUID);

    // Validate basic CoW params
    validateBasicCowParams(order);

    // Validate that swaps for sellToken are enabled
    IPool pool = _pool();
    IPool.SwapDetails memory sellTokenSwapDetails = pool.getAssetSwapDetails(address(order.sellToken));
    if (!isSellingEth(order)) {
      // Eth is always enabled
      require(
        sellTokenSwapDetails.minAmount != 0 || sellTokenSwapDetails.maxAmount != 0,
        'SwapOp: sellToken is not enabled'
      );
    }

    // Validate that swaps for buyToken are enabled
    IPool.SwapDetails memory buyTokenSwapDetails = pool.getAssetSwapDetails(address(order.buyToken));
    if (!isBuyingEth(order)) {
      // Eth is always enabled
      require(
        buyTokenSwapDetails.minAmount != 0 || buyTokenSwapDetails.maxAmount != 0,
        'SwapOp: buyToken is not enabled'
      );
    }

    // Validate oracle price
    // uint256 finalSlippage = Math.max(buyTokenSwapDetails.maxSlippageRatio, sellTokenSwapDetails.maxSlippageRatio);
    uint256 totalOutAmount = orderOutAmount(order);
    uint256 finalSlippage = MAX_SLIPPAGE_DENOMINATOR; // Slippage TBD. 100% for now
    uint256 oracleBuyAmount = twapOracle.consult(address(order.sellToken), totalOutAmount, address(order.buyToken));
    uint256 maxSlippageAmount = (oracleBuyAmount * finalSlippage) / MAX_SLIPPAGE_DENOMINATOR;
    uint256 minBuyAmountOnMaxSlippage = oracleBuyAmount - maxSlippageAmount;
    require(order.buyAmount >= minBuyAmountOnMaxSlippage, 'SwapOp: order.buyAmount doesnt match oracle data');

    // Transfer pool's asset to this contract; wrap ether if needed
    if (isSellingEth(order)) {
      pool.transferAssetToSwapOperator(ETH, totalOutAmount);
      weth.deposit{value: totalOutAmount}();
    } else {
      pool.transferAssetToSwapOperator(address(order.sellToken), totalOutAmount);
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

  function closeOrder(GPv2Order.Data calldata order, bytes32 domainSeparator) external onlyController {
    // Validate there is an order in place
    require(currentOrderUID.length > 0, 'SwapOp: No order in place');

    validateUID(order, domainSeparator, currentOrderUID);

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
    require(order.sellTokenBalance == GPv2Order.BALANCE_ERC20, 'SwapOp: Only erc20 supported for sellTokenBalance');
    require(order.buyTokenBalance == GPv2Order.BALANCE_ERC20, 'SwapOp: Only erc20 supported for buyTokenBalance');
    require(order.kind == GPv2Order.KIND_SELL, 'SwapOp: Only sell operations are supported');
    require(order.receiver == address(this), 'SwapOp: Receiver must be this contract');
    require(order.validTo >= block.timestamp + 600, 'SwapOp: validTo must be at least 10 minutes in the future');
  }

  function approveVaultRelayer(IERC20 token, uint256 amount) internal {
    token.approve(cowVaultRelayer, amount); // infinite approval
  }

  function validateUID(
    GPv2Order.Data calldata order,
    bytes32 domainSeparator,
    bytes memory providedOrderUID
  ) internal pure {
    bytes memory calculatedUID = getUID(order, domainSeparator);
    require(
      keccak256(calculatedUID) == keccak256(providedOrderUID),
      'SwapOp: Provided UID doesnt match calculated UID'
    );
  }

  function _pool() internal view returns (IPool) {
    return IPool(master.getLatestAddress('P1'));
  }

  function orderOutAmount(GPv2Order.Data calldata order) internal pure returns (uint256) {
    return order.sellAmount + order.feeAmount;
  }
}
