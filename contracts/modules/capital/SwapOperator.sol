// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "../../abstract/RegistryAware.sol";
import "../../external/enzyme/IEnzymePolicyManager.sol";
import "../../external/enzyme/IEnzymeV4Comptroller.sol";
import "../../external/enzyme/IEnzymeV4Vault.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../interfaces/IWeth.sol";

/// @title A contract for swapping Pool's assets using CoW protocol
/// @dev This contract's address is set on the Pool's swapOperator variable via governance
contract SwapOperator is ISwapOperator, RegistryAware {
  using SafeERC20 for IERC20;

  // storage

  SwapRequest public swapRequest;
  address public swapController;
  bytes public currentOrderUID;

  // immutables

  IPool public immutable pool;
  ICowSettlement public immutable cowSettlement;
  address public immutable enzymeV4VaultProxyAddress;
  IWeth public immutable weth;

  // constants

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint public constant MIN_VALID_TO_PERIOD = 600; // 10 minutes
  uint public constant MAX_VALID_TO_PERIOD = 31 days; // 1 month

  modifier onlyController() {
    require(msg.sender == swapController, OnlyController());
    _;
  }

  constructor(
    address _registryAddress,
    address _cowSettlement,
    address _enzymeV4VaultProxyAddress,
    address _weth
  ) RegistryAware(_registryAddress) {

    // internal contracts and addresses
    pool = IPool(fetch(C_POOL));

    // cowswap
    cowSettlement = ICowSettlement(_cowSettlement);

    // enzyme
    enzymeV4VaultProxyAddress = _enzymeV4VaultProxyAddress;

    // others
    weth = IWeth(_weth);
  }

  function setSwapController(address _swapController) external onlyContracts(C_GOVERNOR) {
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

  /// @dev Approve a given order to be executed, by presigning it on CoW protocol's settlement contract
  ///      Emits OrderPlaced event on success. Only one order can be open at the same time
  /// @param order - The order to be placed
  /// @param orderUID - the UID of the of the order to be placed
  function placeOrder(
    GPv2Order.Data calldata order,
    bytes calldata orderUID
  ) public onlyController whenNotPaused(PAUSE_SWAPS) {

    require(orderInProgress() == false, OrderInProgress(currentOrderUID));

    // order UID and basic CoW params validations
    bytes memory calculatedOrderUID = getUID(order);
    require(keccak256(orderUID) == keccak256(calculatedOrderUID), OrderUidMismatch(orderUID, calculatedOrderUID));

    // swap request check
    require(address(order.sellToken) == swapRequest.fromAsset, InvalidAsset(swapRequest.fromAsset, address(order.sellToken)));
    require(address(order.buyToken) == swapRequest.toAsset, InvalidAsset(swapRequest.toAsset, address(order.buyToken)));

    require(address(order.sellToken) != enzymeV4VaultProxyAddress, InvalidSwapOperationForAsset(enzymeV4VaultProxyAddress));
    require(address(order.buyToken) != enzymeV4VaultProxyAddress, InvalidSwapOperationForAsset(enzymeV4VaultProxyAddress));

    require(swapRequest.deadline >= block.timestamp, SwapDeadlineExceeded(swapRequest.deadline, block.timestamp));

    if (swapRequest.swapKind == SwapKind.ExactInput) {
      require(order.sellAmount == swapRequest.fromAmount, FromAmountMismatch(swapRequest.fromAmount, order.sellAmount));
      require(order.buyAmount >= swapRequest.toAmount, ToAmountTooLow(swapRequest.toAmount, order.buyAmount));
    } else {
      // ExactOutput (buyAmount)
      require(order.sellAmount <= swapRequest.fromAmount, FromAmountTooHigh(swapRequest.fromAmount, order.sellAmount));
      require(order.buyAmount == swapRequest.toAmount, ToAmountMismatch(swapRequest.toAmount, order.buyAmount));
    }

    require(order.validTo >= block.timestamp + MIN_VALID_TO_PERIOD, BelowMinValidTo());
    require(order.validTo <= block.timestamp + MAX_VALID_TO_PERIOD, AboveMaxValidTo());
    require(order.receiver == address(this), InvalidReceiver(address(this)));

    require(order.sellTokenBalance == GPv2Order.BALANCE_ERC20, UnsupportedTokenBalance('sell'));
    require(order.buyTokenBalance == GPv2Order.BALANCE_ERC20, UnsupportedTokenBalance('buy'));

    // fee must be included in the swapped amount
    require(order.feeAmount == 0, FeeNotZero());

    // delete swap request to mark it as used
    delete swapRequest;

    bool isEthToAsset = address(order.sellToken) == address(weth);

    pool.transferAssetToSwapOperator(
      isEthToAsset ? ETH : address(order.sellToken),
      order.sellAmount
    );

    if (isEthToAsset) {
      weth.deposit{value: order.sellAmount}();
    }

    // approve cowVaultRelayer contract to spend sellToken order.sellAmount
    order.sellToken.safeApprove(cowVaultRelayer(), order.sellAmount);

    // store the orderUID
    currentOrderUID = orderUID;

    // sign the Cow order
    cowSettlement.setPreSignature(orderUID, true);

    emit OrderPlaced(order);
  }

  /// @dev Close a previously placed order, returning assets to the pool (either fulfilled or not)
  /// Emits OrderClosed event on success
  /// @param order The order to close
  function closeOrder(GPv2Order.Data calldata order) external onlyController whenNotPaused(PAUSE_SWAPS) {

    require(orderInProgress() == true, NoOrderToClose());

    bytes memory calculatedOrderUID = getUID(order);
    require(
      keccak256(currentOrderUID) == keccak256(calculatedOrderUID),
      OrderUidMismatch(currentOrderUID, calculatedOrderUID)
    );

    // read before invalidating the order
    uint filledAmount = cowSettlement.filledAmount(currentOrderUID);

    // invalidate signature, cancel order and unapprove tokens
    cowSettlement.setPreSignature(currentOrderUID, false);
    cowSettlement.invalidateOrder(currentOrderUID);
    order.sellToken.safeApprove(cowVaultRelayer(), 0);

    // withdraw both buyToken and sellToken
    returnAssetToPool(order.buyToken);
    returnAssetToPool(order.sellToken);

    address sellToken = address(order.sellToken) == address(weth) ? ETH : address(order.sellToken);
    pool.clearSwapAssetAmount(sellToken);

    delete currentOrderUID;

    // emit event
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
  /// @param fromAmount Amount of ETH to send into the Enzyme Vault
  /// @param toAmountMin Minimum Enzyme Vault shares expected to get out
  function swapETHForEnzymeVaultShare(
    uint fromAmount,
    uint toAmountMin
  ) external onlyController whenNotPaused(PAUSE_SWAPS) {

    // validate there's no current cow swap order going on
    require(orderInProgress() == false, OrderInProgress(currentOrderUID));

    IERC20 toToken = IERC20(enzymeV4VaultProxyAddress);
    IEnzymeV4Comptroller comptrollerProxy = enzymeComptroller();

    // swap request check
    require(swapRequest.fromAsset == address(weth), InvalidAsset(swapRequest.fromAsset, address(weth)));
    require(swapRequest.toAsset == enzymeV4VaultProxyAddress, InvalidAsset(swapRequest.toAsset, enzymeV4VaultProxyAddress));
    require(swapRequest.deadline >= block.timestamp, SwapDeadlineExceeded(swapRequest.deadline, block.timestamp));
    require(swapRequest.swapKind == SwapKind.ExactInput, InvalidSwapKind());
    require(swapRequest.fromAmount == fromAmount, FromAmountMismatch(swapRequest.fromAmount, fromAmount));
    require(toAmountMin >= swapRequest.toAmount, ToAmountTooLow(swapRequest.toAmount, toAmountMin));

    // denomination asset
    {
      address denominationAsset = comptrollerProxy.getDenominationAsset();
      require(denominationAsset == address(weth), InvalidDenominationAsset(address(weth), denominationAsset));
    }

    // delete swap request to mark it as used
    delete swapRequest;

    pool.transferAssetToSwapOperator(ETH, fromAmount);
    weth.deposit{ value: fromAmount }();

    uint fromTokenBalanceBefore = weth.balanceOf(address(this));
    uint toTokenBalanceBefore = toToken.balanceOf(address(this));

    weth.approve(address(comptrollerProxy), fromAmount);
    comptrollerProxy.buyShares(fromAmount, toAmountMin);
    weth.approve(address(comptrollerProxy), 0);

    uint fromTokenBalanceAfter = weth.balanceOf(address(this));
    uint toTokenBalanceAfter = toToken.balanceOf(address(this));

    // redundant in theory
    uint actualFromAmount = fromTokenBalanceBefore - fromTokenBalanceAfter;
    require(actualFromAmount <= fromAmount, SwappedFromAmountTooHigh(fromAmount, actualFromAmount));

    uint actualToAmount = toTokenBalanceAfter - toTokenBalanceBefore;
    require(actualToAmount >= toAmountMin, SwappedToAmountTooLow(toAmountMin, actualToAmount));

    returnAssetToPool(toToken);
    returnAssetToPool(IERC20(address(weth)));
    pool.clearSwapAssetAmount(ETH);

    emit Swapped(ETH, enzymeV4VaultProxyAddress, actualFromAmount, actualToAmount);
  }

  /// @dev Exchanges Enzyme Vault shares for ETH with slippage control. Emits `Swapped` on success
  /// @param fromAmount Amount of Enzyme Vault shares to be swapped for ETH
  /// @param toAmountMin Minimum ETH out expected
  function swapEnzymeVaultShareForETH(
    uint fromAmount,
    uint toAmountMin
  ) external onlyController whenNotPaused(PAUSE_SWAPS) {

    // validate there's no current cow swap order going on
    require(orderInProgress() == false, OrderInProgress(currentOrderUID));

    IERC20 fromToken = IERC20(enzymeV4VaultProxyAddress);
    IEnzymeV4Comptroller comptrollerProxy = enzymeComptroller();

    // swap request check
    require(swapRequest.fromAsset == enzymeV4VaultProxyAddress, InvalidAsset(swapRequest.fromAsset, enzymeV4VaultProxyAddress));
    require(swapRequest.toAsset == address(weth), InvalidAsset(swapRequest.toAsset, address(weth)));
    require(swapRequest.deadline >= block.timestamp, SwapDeadlineExceeded(swapRequest.deadline, block.timestamp));
    require(swapRequest.swapKind == SwapKind.ExactInput, InvalidSwapKind());
    require(swapRequest.fromAmount == fromAmount, FromAmountMismatch(swapRequest.fromAmount, fromAmount));
    require(toAmountMin >= swapRequest.toAmount, ToAmountTooLow(swapRequest.toAmount, toAmountMin));

    // denomination asset
    {
      address denominationAsset = comptrollerProxy.getDenominationAsset();
      require(denominationAsset == address(weth), InvalidDenominationAsset(address(weth), denominationAsset));
    }

    // delete swap request to mark it as used
    delete swapRequest;

    pool.transferAssetToSwapOperator(enzymeV4VaultProxyAddress, fromAmount);

    uint fromTokenBalanceBefore = fromToken.balanceOf(address(this));
    uint toTokenBalanceBefore = weth.balanceOf(address(this));

    // execution
    {
      address[] memory assetsOut = new address[](1);
      assetsOut[0] = address(weth);

      uint[] memory assetsOutPercentages = new uint[](1);
      assetsOutPercentages[0] = 10000; // in bps

      fromToken.approve(address(comptrollerProxy), fromAmount);
      comptrollerProxy.redeemSharesForSpecificAssets(address(this), fromAmount, assetsOut, assetsOutPercentages);
      fromToken.approve(address(comptrollerProxy), 0);
    }

    uint fromTokenBalanceAfter = fromToken.balanceOf(address(this));
    uint toTokenBalanceAfter = weth.balanceOf(address(this));

    uint actualFromAmount = fromTokenBalanceBefore - fromTokenBalanceAfter;
    require(actualFromAmount <= fromAmount, SwappedFromAmountTooHigh(fromAmount, actualFromAmount));

    uint toAmount = toTokenBalanceAfter - toTokenBalanceBefore;
    require(toAmount >= toAmountMin, SwappedToAmountTooLow(toAmountMin, toAmount));

    returnAssetToPool(IERC20(address(weth)));
    returnAssetToPool(fromToken);
    pool.clearSwapAssetAmount(enzymeV4VaultProxyAddress);

    emit Swapped(enzymeV4VaultProxyAddress, ETH, actualFromAmount, toAmount);
  }

  /// @dev Create a request to swap two assets
  function requestAssetSwap(
    SwapRequest memory request
  ) external onlyContracts(C_GOVERNOR) whenNotPaused(PAUSE_SWAPS) {

    Asset[] memory assets = pool.getAssets();

    bool isValidFromAsset = false;
    bool isValidToAsset = false;

    for (uint i = 0; i < assets.length; i++) {
      if (assets[i].assetAddress == request.fromAsset && !assets[i].isAbandoned) {
        isValidFromAsset = true;
      }

      if (assets[i].assetAddress == request.toAsset && !assets[i].isAbandoned) {
        isValidToAsset = true;
      }
    }

    require(isValidFromAsset, UnsupportedAsset(request.fromAsset));
    require(isValidToAsset, UnsupportedAsset(request.toAsset));
    require(request.fromAsset != request.toAsset, SameAssetSwapRequest(request.fromAsset));
    require(request.deadline > block.timestamp, SwapDeadlineExceeded(request.deadline, block.timestamp));

    // store WETH instead of ETH for convenience
    if (request.fromAsset == ETH) {
      request.fromAsset = address(weth);
    }

    if (request.toAsset == ETH) {
      request.toAsset = address(weth);
    }

    swapRequest = request;

    emit SwapRequestCreated(
      swapRequest.fromAsset,
      swapRequest.toAsset,
      swapRequest.fromAmount,
      swapRequest.toAmount,
      swapRequest.swapKind,
      swapRequest.deadline
    );
  }

  /// @dev Recovers assets in the SwapOperator to the pool or a specified receiver, ensuring no ongoing CoW swap orders
  /// @param assetAddress Address of the asset to recover
  /// @param receiver Address to receive the recovered assets, if asset is not supported by the pool
  function recoverAsset(address assetAddress, address receiver) public onlyController whenNotPaused(PAUSE_SWAPS) {

    require(receiver != address(0), InvalidRecoveryReceiver());
    require(orderInProgress() == false, OrderInProgress(currentOrderUID));

    if (assetAddress == address(weth)) {
      uint wethBalance = weth.balanceOf(address(this));
      require(wethBalance > 0, ZeroBalance());
      // just withdrawing here, the next code block will send it to the pool
      weth.withdraw(wethBalance);
    }

    if (assetAddress == ETH || assetAddress == address(weth)) {

      uint ethBalance = address(this).balance;
      require(ethBalance > 0, ZeroBalance());

      (bool sent, ) = payable(address(pool)).call{value: ethBalance}("");
      require(sent, TransferFailed(address(pool), ethBalance, ETH));
      return;
    }

    IERC20 asset = IERC20(assetAddress);
    uint balance = asset.balanceOf(address(this));
    require(balance > 0, ZeroBalance());

    Asset[] memory assets = pool.getAssets();
    bool isSupported = false;

    for (uint i = 0; i < assets.length; i++) {
      if (assets[i].assetAddress == assetAddress && !assets[i].isAbandoned) {
        isSupported = true;
        break;
      }
    }

    address destination = isSupported ? address(pool) : receiver;
    asset.safeTransfer(destination, balance);
  }

  /// @dev Checks if there is an ongoing order
  /// @return bool True if an order is currently in progress, otherwise false
  function orderInProgress() public view returns (bool) {
    return currentOrderUID.length > 0;
  }
}
