// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../abstract/ReentrancyGuard.sol";
import "../../interfaces/IRamm.sol";
import "../../interfaces/ILegacyPool.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/RegistryLibrary.sol";

contract Pool is IPool, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  /* storage */

  Asset[] public assets;

  // todo: consider removing
  mapping(address => SwapDetails) public swapDetails;

  // 1 slot
  uint104 public assetInSwapOperator;
  uint8 public assetsInSwapOperatorBitmap;
  // 144 bits left

  /* immutables */

  address public immutable swapOperator;
  address public immutable safeTracker;

  /* constants */

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint public constant MCR_RATIO_DECIMALS = 4;
  uint public constant MAX_MCR_ADJUSTMENT = 100;
  uint public constant MAX_MCR_INCREMENT = 500;
  uint public constant BASIS_PRECISION = 10000;
  uint public constant GEARING_FACTOR = 48000;
  uint public constant MIN_UPDATE_TIME = 3600; // min time between MCR updates in seconds
  uint public constant MAX_SLIPPAGE_DENOMINATOR = 10000;

  modifier nonReentrant {
    require(!reentrancyLocked, "ReentrancyGuard: reentrant call");
    reentrancyLocked = true;
    _;
    reentrancyLocked = false;
  }

  modifier onlySwapOperator {
    require(msg.sender == swapOperator, "Pool: Not swapOperator");
    _;
  }

  modifier onlyRamm {
    require(msg.sender == internalContracts[uint(ID.RA)], "Pool: Not Ramm");
    _;
  }

  /* ========== CONSTRUCTOR ========== */

  constructor (
    address _master,
    address _priceOracle,
    address _swapOperator,
    address _previousPool
  ) {
    master = INXMMaster(_master);
    swapOperator = _swapOperator;

    ILegacyPool previousPool = ILegacyPool(_previousPool);

    // copy over assets and swap details
    ILegacyPool.Asset[] memory previousAssets = previousPool.getAssets();

    for (uint i = 0; i < previousAssets.length; i++) {

      address assetAddress = previousAssets[i].assetAddress;

      assets.push(
        Asset(
          previousAssets[i].assetAddress,
          previousAssets[i].isCoverAsset,
          previousAssets[i].isAbandoned
        )
      );

      if (assetAddress != ETH) {
        ILegacyPool.SwapDetails memory previousSwapDetails = previousPool.getAssetSwapDetails(assetAddress);
        swapDetails[assetAddress] = SwapDetails(
          previousSwapDetails.minAmount,
          previousSwapDetails.maxAmount,
          previousSwapDetails.lastSwapTime,
          previousSwapDetails.maxSlippageRatio
        );
      }
    }

    _setPriceFeedOracle(IPriceFeedOracle(_priceOracle));
  }

  receive() external payable {}

  /* ========== ASSET RELATED VIEW FUNCTIONS ========== */

  function getAssetValueInEth(address assetAddress, uint assetAmountInSwapOperator) internal view returns (uint) {

    uint assetBalance = assetAmountInSwapOperator;

    if (assetAddress.code.length != 0) {
      try IERC20(assetAddress).balanceOf(address(this)) returns (uint balance) {
        assetBalance += balance;
      } catch {
        // If balanceOf reverts consider it 0
      }
    }

    // If the assetBalance is 0 skip the oracle call to save gas
    if (assetBalance == 0) {
      return 0;
    }

    return priceFeedOracle.getEthForAsset(assetAddress, assetBalance);
  }

  ///
  /// @dev Calculates total value of all pool assets in ether
  ///
  function getPoolValueInEth() public override view returns (uint) {

    uint total = address(this).balance;

    uint assetCount = assets.length;
    uint _assetsInSwapOperatorBitmap = assetsInSwapOperatorBitmap;

    for (uint i = 0; i < assetCount; i++) {
      Asset memory asset = assets[i];

      if (asset.isAbandoned) {
        continue;
      }

      uint assetAmountInSwapOperator = isAssetInSwapOperator(i, _assetsInSwapOperatorBitmap)
        ? assetInSwapOperator
        : 0;

      // check if the asset is ETH and skip the oracle call
      if (i == 0) {
        total += assetAmountInSwapOperator;
        continue;
      }

      total += getAssetValueInEth(asset.assetAddress, assetAmountInSwapOperator);
    }

    return total;
  }

  function getAsset(uint assetId) external override view returns (Asset memory) {
    require(assetId < assets.length, "Pool: Invalid asset id");
    return assets[assetId];
  }

  function getAssets() external override view returns (Asset[] memory) {
    return assets;
  }

  function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory) {
    return swapDetails[assetAddress];
  }

  function getAssetId(address assetAddress) public view returns (uint) {

    uint assetCount = assets.length;
    for (uint i = 0; i < assetCount; i++) {
      if (assets[i].assetAddress == assetAddress) {
        return i;
      }
    }

    revert AssetNotFound();
  }

  function isAssetInSwapOperator(uint _assetId, uint _assetsBitmap) internal pure returns (bool) {
    // there are assets in the swap operator and the asset id is in the swap operator assets
    return _assetsBitmap != 0 && ((1 << _assetId) & _assetsBitmap != 0);
  }

  /* ========== ASSET RELATED MUTATIVE FUNCTIONS ========== */

  function addAsset(
    address assetAddress,
    bool isCoverAsset,
    uint _min,
    uint _max,
    uint _maxSlippageRatio
  ) external onlyGovernance {

    require(assetAddress != address(0), "Pool: Asset is zero address");
    require(_max >= _min, "Pool: max < min");
    require(_maxSlippageRatio <= MAX_SLIPPAGE_DENOMINATOR, "Pool: Max slippage ratio > 1");

    (Aggregator aggregator,) = priceFeedOracle.assets(assetAddress);
    require(address(aggregator) != address(0), "Pool: PriceFeedOracle lacks aggregator for asset");

    // Check whether the new asset already exists as a cover asset
    uint assetCount = assets.length;

    for (uint i = 0; i < assetCount; i++) {
      require(assetAddress != assets[i].assetAddress, "Pool: Asset exists");
    }

    assets.push(
      Asset(
        assetAddress,
        isCoverAsset,
        false  // is abandoned
      )
    );

    // Set the swap details
    swapDetails[assetAddress] = SwapDetails(
      _min.toUint104(),
      _max.toUint104(),
      0, // last swap time
      _maxSlippageRatio.toUint16()
    );
  }

  function setAssetDetails(
    uint assetId,
    bool isCoverAsset,
    bool isAbandoned
  ) external onlyGovernance {
    require(assets.length > assetId, "Pool: Asset does not exist");
    assets[assetId].isCoverAsset = isCoverAsset;
    assets[assetId].isAbandoned = isAbandoned;
  }

  function setSwapDetails(
    address assetAddress,
    uint _min,
    uint _max,
    uint _maxSlippageRatio
  ) external onlyGovernance {

    require(_min <= _max, "Pool: min > max");
    require(_maxSlippageRatio <= MAX_SLIPPAGE_DENOMINATOR, "Pool: Max slippage ratio > 1");

    uint assetCount = assets.length;

    for (uint i = 0; i < assetCount; i++) {

      if (assetAddress != assets[i].assetAddress) {
        continue;
      }

      swapDetails[assetAddress].minAmount = _min.toUint104();
      swapDetails[assetAddress].maxAmount = _max.toUint104();
      swapDetails[assetAddress].maxSlippageRatio = _maxSlippageRatio.toUint16();

      return;
    }

    revert AssetNotFound();
  }

  function transferAsset(
    address assetAddress,
    address payable destination,
    uint amount
  ) external onlyGovernance nonReentrant {

    require(swapDetails[assetAddress].maxAmount == 0, "Pool: Max not zero");
    require(destination != address(0), "Pool: Dest zero");

    IERC20 token = IERC20(assetAddress);
    uint balance = token.balanceOf(address(this));
    uint transferableAmount = amount > balance ? balance : amount;

    token.safeTransfer(destination, transferableAmount);
  }

  /* ========== SWAPOPERATOR RELATED MUTATIVE FUNCTIONS ========== */

  function transferAssetToSwapOperator(
    address assetAddress,
    uint amount
  ) public override onlySwapOperator nonReentrant whenNotPaused {

    if (assetAddress == ETH) {
      (bool ok, /* data */) = swapOperator.call{value: amount}("");
      require(ok, "Pool: ETH transfer failed");
      return;
    }

    IERC20 token = IERC20(assetAddress);
    token.safeTransfer(swapOperator, amount);
  }

  function setSwapDetailsLastSwapTime(
    address assetAddress,
    uint32 lastSwapTime
  ) public override onlySwapOperator whenNotPaused {
    swapDetails[assetAddress].lastSwapTime = lastSwapTime;
  }

  function setSwapAssetAmount(address assetAddress, uint value) external onlySwapOperator whenNotPaused {

    uint assetId = getAssetId(assetAddress);
    assetInSwapOperator = value;

    if (value == 0) {
      assetsInSwapOperatorBitmap = 0;
      return;
    }

    require(assetsInSwapOperatorBitmap == 0, OrderInProgress());
    assetsInSwapOperatorBitmap = uint8(1 << assetId);
  }

  /* ========== CLAIMS RELATED MUTATIVE FUNCTIONS ========== */

  /// @dev Executes a payout
  /// @param assetId        Index of the cover asset
  /// @param payoutAddress  Send funds to this address
  /// @param amount         Amount to send
  /// @param ethDepositAmount  Deposit amount to send
  ///
  function sendPayout(
    uint assetId,
    address payable payoutAddress,
    uint amount
  ) external override onlyInternal nonReentrant {

    Asset memory asset = assets[assetId];

    if (asset.assetAddress == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool transferSucceeded, /* data */) = payoutAddress.call{value: amount}("");
      require(transferSucceeded, "Pool: ETH transfer failed");
    } else {
      IERC20(asset.assetAddress).safeTransfer(payoutAddress, amount);
    }

    emit Payout(payoutAddress, asset.assetAddress, amount);

    mcr().updateMCRInternal(true);
  }

  /* ========== TOKEN RELATED MUTATIVE FUNCTIONS ========== */

  /// @dev Sends ETH to a member in exchange for NXM tokens.
  /// @param member  Member address
  /// @param amount  Amount of ETH to send
  ///
  function sendEth(address member, uint amount) external override onlyRamm nonReentrant {
    (bool transferSucceeded, /* data */) = member.call{value: amount}("");
    require(transferSucceeded, "Pool: ETH transfer failed");
  }

  function calculateMCRRatio(
    uint totalAssetValue,
    uint mcrEth
  ) public override pure returns (uint) {
    return totalAssetValue * (10 ** MCR_RATIO_DECIMALS) / mcrEth;
  }

  /* ========== TOKEN RELATED VIEW FUNCTIONS ========== */

  /// Uses internal price for calculating the token price in ETH
  /// It's being used in Cover and IndividualClaims
  /// Returns the internal NXM price in a given asset.
  ///
  /// @dev The pool contract is not a proxy and its address will change as we upgrade it.
  /// @dev You may want TokenController.getTokenPrice() for a stable address since it's a proxy.
  ///
  /// @param assetId  Index of the cover asset.
  ///
  function getInternalTokenPriceInAsset(uint assetId) public view override returns (uint tokenPrice) {

    require(assetId < assets.length, "Pool: Unknown cover asset");
    address assetAddress = assets[assetId].assetAddress;

    uint tokenInternalPrice = ramm().getInternalPrice();

    return priceFeedOracle.getAssetForEth(assetAddress, tokenInternalPrice);
  }

  /// Uses internal price for calculating the token price in ETH and updates TWAP
  /// It's being used in Cover
  /// Returns the internal NXM price in a given asset.
  ///
  /// @dev The pool contract is not a proxy and its address will change as we upgrade it.
  /// @dev You may want TokenController.getTokenPrice() for a stable address since it's a proxy.
  ///
  /// @param assetId  Index of the cover asset.
  ///
  function getInternalTokenPriceInAssetAndUpdateTwap(uint assetId) public override returns (uint tokenPrice) {

    require(assetId < assets.length, "Pool: Unknown cover asset");
    address assetAddress = assets[assetId].assetAddress;

    uint tokenInternalPrice = ramm().getInternalPriceAndUpdateTwap();

    return priceFeedOracle.getAssetForEth(assetAddress, tokenInternalPrice);
  }

  /// [deprecated] Returns spot NXM price in ETH from ramm contract.
  ///
  /// @dev The pool contract is not a proxy and its address will change as we upgrade it.
  /// @dev You may want TokenController.getTokenPrice() for a stable address since it's a proxy.
  ///
  function getTokenPrice() public override view returns (uint tokenPrice) {
    (, tokenPrice) = ramm().getSpotPrices();
    return tokenPrice;
  }

  function getMCRRatio() public override view returns (uint) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = mcr().getMCR();
    return calculateMCRRatio(totalAssetValue, mcrEth);
  }

  function _setPriceFeedOracle(IPriceFeedOracle _priceFeedOracle) internal {
    uint assetCount = assets.length;

    // start from 1 (0 is ETH and doesn't need an oracle)
    for (uint i = 1; i < assetCount; i++) {
      (Aggregator aggregator,) = _priceFeedOracle.assets(assets[i].assetAddress);
      require(address(aggregator) != address(0), "Pool: PriceFeedOracle lacks aggregator for asset");
    }

    priceFeedOracle = _priceFeedOracle;
  }

  /// MCR ///

  function getTotalActiveCoverAmount() public view returns (uint) {

    IPriceFeedOracle priceFeed = _pool.priceFeedOracle();
    ICover _cover = cover();

    uint totalActiveCoverAmountInEth = _cover.totalActiveCoverInAsset(0);

    Asset[] memory assets = getAssets();

    // skip the first asset - it's ETH, it's already accounted for above
    for (uint i = 1; i < assets.length; i++) {
      uint activeCoverAmount = _cover.totalActiveCoverInAsset(i);
      uint assetAmountInEth = priceFeed.getEthForAsset(assets[i].assetAddress, activeCoverAmount);
      totalActiveCoverAmountInEth += assetAmountInEth;
    }

    return totalActiveCoverAmountInEth;
  }

  function updateMCR() whenNotPaused public {
    _updateMCR(false);
  }

  function updateMCRInternal(bool forceUpdate) public onlyInternal {
    _updateMCR(forceUpdate);
  }

  function _updateMCR(bool forceUpdate) internal {

    // read with 1 SLOAD
    uint112 _mcr = mcr;
    uint112 _desiredMCR = desiredMCR;
    uint32 _lastUpdateTime = lastUpdateTime;

    if (!forceUpdate && _lastUpdateTime + MIN_UPDATE_TIME > block.timestamp) {
      return;
    }

    // sync the current virtual MCR value to storage
    uint80 newMCR = getMCR().toUint80();
    if (newMCR != _mcr) {
      mcr = newMCR;
    }

    uint totalSumAssured = getTotalActiveCoverAmount();
    uint gearedMCR = totalSumAssured * BASIS_PRECISION / GEARING_FACTOR;

    uint80 newDesiredMCR = gearedMCR.toUint80();
    if (newDesiredMCR != _desiredMCR) {
      desiredMCR = newDesiredMCR;
    }

    lastUpdateTime = uint32(block.timestamp);

    emit MCRUpdated(mcr, desiredMCR, 0, gearedMCR, totalSumAssured);
  }

  // ORACLES

  /// @notice Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
  /// @param assetAddress address of asset
  /// @return price in ether
  function getAssetToEthRate(address assetAddress) public view returns (uint) {

    if (assetAddress == ETH || assetAddress == safeTracker) {
      return 1 ether;
    }

    AssetInfo memory asset = assetsMap[assetAddress];
    return _getAssetToEthRate(asset.aggregator, asset.aggregatorType);
  }

  /// @notice Returns the amount of currency that is equivalent to ethIn amount of ether.
  /// @param assetAddress address of asset
  /// @param ethIn amount of ether to be converted to the asset
  /// @return asset amount
  function getAssetForEth(address assetAddress, uint ethIn) external view returns (uint) {
    if (assetAddress == ETH || assetAddress == safeTracker) {
      return ethIn;
    }

    AssetInfo memory asset = assetsMap[assetAddress];
    uint price = _getAssetToEthRate(asset.aggregator, asset.aggregatorType);

    return ethIn * (10 ** uint(asset.decimals)) / price;
  }

  /// @notice Returns the amount of eth that is equivalent to a given asset and amount
  /// @param assetAddress address of asset
  /// @param amount amount of asset
  /// @return amount of ether
  function getEthForAsset(address assetAddress, uint amount) external view returns (uint) {
    if (assetAddress == ETH || assetAddress == safeTracker) {
      return amount;
    }

    AssetInfo memory asset = assetsMap[assetAddress];
    uint price = _getAssetToEthRate(asset.aggregator, asset.aggregatorType);

    return amount * (price) / 10 ** uint(asset.decimals);
  }

  /// @notice Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
  /// @param aggregator The asset aggregator
  /// @param aggregatorType The asset aggregator type (i.e ETH, USD)
  /// @return price in ether
  function _getAssetToEthRate(Aggregator aggregator, AggregatorType aggregatorType) internal view returns (uint) {
    // NOTE: Current implementation relies on off-chain staleness checks, consider adding on-chain staleness check?
    int rate = aggregator.latestAnswer();
    if (rate <= 0) {
      revert NonPositiveRate(address(aggregator), rate);
    }

    if (aggregatorType == AggregatorType.ETH) {
      return uint(rate);
    }

    // AggregatorType.USD - convert the USD rate to its equivalent ETH rate using the ETH-USD exchange rate
    AssetInfo memory ethAsset = assetsMap[ETH];

    int ethUsdRate = ethAsset.aggregator.latestAnswer();

    if (ethUsdRate <= 0) {
      revert NonPositiveRate(ETH, ethUsdRate);
    }

    return (uint(rate) * 1e18) / uint(ethUsdRate);
  }

}
