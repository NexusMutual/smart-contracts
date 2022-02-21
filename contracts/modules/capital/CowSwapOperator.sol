// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import '../../external/cow/GPv2Order.sol';
import '@openzeppelin/contracts-v4/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts-v4/utils/math/Math.sol';
import '../../interfaces/INXMMaster.sol';
import '../../interfaces/IPool.sol';
import '../../interfaces/ITwapOracle.sol';

interface ICowSettlement {
  function setPreSignature(bytes calldata orderUid, bool signed) external;
}

contract CowSwapOperator {
  // Storage
  ICowSettlement public immutable cowSettlement;
  address public immutable cowVaultRelayer;
  INXMMaster public master;
  address public immutable swapController;
  IERC20 public immutable weth;
  ITwapOracle public immutable twapOracle;

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint16 constant MAX_SLIPPAGE_DENOMINATOR = 10000;

  constructor(
    address _cowSettlement,
    address _cowVaultRelayer,
    address _swapController,
    address _master,
    address _weth,
    address _twapOracle
  ) {
    cowSettlement = ICowSettlement(_cowSettlement);
    cowVaultRelayer = _cowVaultRelayer;
    master = INXMMaster(_master);
    swapController = _swapController;
    weth = IERC20(_weth);
    twapOracle = ITwapOracle(_twapOracle);
  }

  function placeOrder(
    GPv2Order.Data calldata order,
    bytes32 domainSeparator,
    bytes calldata orderUID
  ) public {
    // Helper local variables
    IPool pool = _pool();
    uint256 totalOutAmount = order.sellAmount + order.feeAmount;
    uint256 sellTokenBalance = order.sellToken.balanceOf(address(pool));
    uint256 buyTokenBalance = order.buyToken.balanceOf(address(pool));
    bool isSellingEth = address(order.sellToken) == ETH;
    bool isBuyingEth = address(order.buyToken) == ETH;

    // Order UID verification
    require(validateUID(order, domainSeparator, orderUID), 'Provided UID doesnt match calculated UID');

    // Basic sanity checks
    require(order.sellToken.balanceOf(address(pool)) >= order.sellAmount, 'Not enough token balance to sell');
    require(order.sellTokenBalance == GPv2Order.BALANCE_ERC20, 'Only erc20 supported for sellTokenBalance');
    require(order.buyTokenBalance == GPv2Order.BALANCE_ERC20, 'Only erc20 supported for buyTokenBalance');
    require(order.kind == GPv2Order.KIND_SELL, 'Only sell operations are supported');
    require(order.receiver == address(this), 'Receiver must be this contract');
    require(order.validTo >= block.timestamp + 600, 'validTo must be at least 10 minutes in the future');

    // Validate that swaps for sellToken are enabled
    (
      uint104 sellTokenMin,
      uint104 sellTokenMax,
      uint32 sellTokenLastAssetSwapTime,
      uint16 sellTokenMaxSlippageRatio
    ) = pool.getAssetSwapDetails(address(order.sellToken));
    if (!isSellingEth) {
      // Eth is always enabled
      require(sellTokenMin != 0 || sellTokenMax != 0, 'CowSwapOperator: sellToken is not enabled');
    }

    // Validate that swaps for buyToken are enabled
    (uint104 buyTokenMin, uint104 buyTokenMax, uint32 buyTokenLastAssetSwapTime, uint16 buyTokenMaxSlippageRatio) = pool
      .getAssetSwapDetails(address(order.buyToken));
    if (!isBuyingEth) {
      // Eth is always enabled
      require(buyTokenMin != 0 || buyTokenMax != 0, 'CowSwapOperator: buyToken is not enabled');
    }

    // Validate oracle price
    uint256 finalSlippage = Math.max(buyTokenMaxSlippageRatio, sellTokenMaxSlippageRatio);
    uint256 oracleBuyAmount = twapOracle.consult(address(order.sellToken), totalOutAmount, address(order.buyToken));
    uint256 maxSlippageAmount = (oracleBuyAmount * finalSlippage) / MAX_SLIPPAGE_DENOMINATOR;
    uint256 minBuyAmountOnMaxSlippage = oracleBuyAmount - maxSlippageAmount;
    require(order.buyAmount >= minBuyAmountOnMaxSlippage, 'CowSwapOperator: order.buyAmount doesnt match oracle data');

    // Transfer pool's asset to this contract
    pool.transferAssetToSwapOperator(address(order.sellToken), totalOutAmount);

    // Approve Cow's contract to spend sellToken
    approveVaultRelayer(order.sellToken, totalOutAmount);

    // Register last swap time on swapDetail
    // pool.setSwapDetailsLastSwapTime(nonEthToken, uint32(block.timestamp));

    // Sign the Cow order
    cowSettlement.setPreSignature(orderUID, true);
  }

  function approveVaultRelayer(IERC20 token, uint256 amount) private {
    token.approve(cowVaultRelayer, amount); // infinite approval
  }

  function validateUID(
    GPv2Order.Data calldata order,
    bytes32 domainSeparator,
    bytes calldata providedOrderUID
  ) private pure returns (bool) {
    bytes memory calculatedUID = getUID(order, domainSeparator);
    return keccak256(calculatedUID) == keccak256(providedOrderUID);
  }

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

  function _pool() internal view returns (IPool) {
    return IPool(master.getLatestAddress('P1'));
  }
}
