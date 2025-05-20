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
  Oracle[] public oracles;

  // 1 slot
  AssetInSwapOperator public assetInSwapOperator;

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

  /* ========== ASSETS ========== */

  ///
  /// @dev Calculates total value of all pool assets in ether
  ///
  function getPoolValueInEth() public override view returns (uint) {

    uint total = address(this).balance;

    uint assetCount = assets.length;
    uint assetIdInSwapOperator = assetInSwapOperator.assetId;
    uint assetAmountInSwapOperator = assetInSwapOperator.amount;

    for (uint i = 0; i < assetCount; i++) {

      // check if the asset is ETH and exit the loop early
      // it's assumed we don't abandon ETH
      if (i == 0) {
        total += assetBalance;
        continue;
      }

      Asset memory asset = assets[i];

      if (asset.isAbandoned) {
        continue;
      }

      uint assetBalance = assetIdInSwapOperator == i ? assetAmountInSwapOperator : 0;
      address assetAddress = asset.assetAddress;

      if (assetAddress.code.length != 0) {
        try IERC20(assetAddress).balanceOf(address(this)) returns (uint balance) {
          assetBalance += balance;
        } catch {
          // If balanceOf reverts consider it 0
        }
      }

      if (assetBalance == 0) {
        continue;
      }

      total += getEthForAsset(assetAddress, assetBalance);
    }

    return total;
  }

  function getAsset(uint assetId) external override view returns (Asset memory) {
    require(assetId < assets.length, InvalidAssetId());
    return assets[assetId];
  }

  function getAssets() external override view returns (Asset[] memory) {
    return assets;
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

  function addAsset(
    address assetAddress,
    bool isCoverAsset,
    Aggregator aggregator,
    AggregatorType aggregatorType
  ) external onlyGovernance {

    require(assetAddress != address(0), AssetMustNotBeZeroAddress());
    require(address(aggregator) != address(0), AggregatorMustNotBeZeroAddress());

    // check if it already exists
    uint assetCount = assets.length;

    for (uint i = 0; i < assetCount; i++) {
      require(assetAddress != assets[i].assetAddress, AssetAlreadyExists());
    }

    uint assetDecimals = IERC20(assetAddress).decimals();
    uint aggregatorDecimals = aggregator.decimals();

    if (aggregatorType == AggregatorType.ETH && aggregatorDecimals != 18) {
        revert IncompatibleAggregatorDecimals(aggregator, aggregatorDecimals, 18);
    }

    if (aggregatorType == AggregatorType.USD && aggregatorDecimals != 8) {
        revert IncompatibleAggregatorDecimals(aggregator, aggregatorDecimals, 8);
    }

    Asset memory asset = Asset({
      assetAddress: assetAddress,
      decimals: assetDecimals.toUint8(),
      isCoverAsset: isCoverAsset,
      isAbandoned: false
    });

    Oracle memory oracle = Oracle({ aggregator: aggregator, aggregatorType: aggregatorType });

    assets.push(asset);
    oracles.push(oracle);
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

  /* ========== SWAP OPERATOR ========== */

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

  function setSwapAssetAmount(uint assetId, uint value) external onlySwapOperator whenNotPaused {

    require(assetInSwapOperator.amount == 0, OrderInProgress());

    if (value == 0) {
      require(assetInSwapOperator.assetId == assetId, InvalidAssetId());
      delete assetInSwapOperator;
      return;
    }

    assetInSwapOperator = AssetInSwapOperator({
      assetId: assetId.toUint8(),
      amount: value.toUint96()
    });
  }

  /* ========== CLAIMS ========== */

  /// @dev Executes a payout
  /// @param assetId        Index of the cover asset
  /// @param payoutAddress  Send funds to this address
  /// @param amount         Amount to send
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

  /* ========== TOKEN AND RAMM ========== */

  /// @dev Sends ETH to a member in exchange for NXM tokens.
  /// @param member  Member address
  /// @param amount  Amount of ETH to send
  ///
  function sendEth(address member, uint amount) external override onlyRamm nonReentrant {
    (bool transferSucceeded, /* data */) = member.call{value: amount}("");
    require(transferSucceeded, "Pool: ETH transfer failed");
  }

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

  /* ========== MCR ========== */

  function getTotalActiveCoverAmount() public view returns (uint) {

    ICover _cover = cover();

    uint totalActiveCoverAmountInEth = _cover.totalActiveCoverInAsset(0);

    Asset[] memory _assets = getAssets();

    // skip the first asset - it's ETH, it's already accounted for above
    for (uint i = 1; i < _assets.length; i++) {
      uint activeCoverAmount = _cover.totalActiveCoverInAsset(i);
      uint assetAmountInEth = getEthForAsset(_assets[i].assetAddress, activeCoverAmount);
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

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public override pure returns (uint) {
    return totalAssetValue * (10 ** MCR_RATIO_DECIMALS) / mcrEth;
  }

  /* ========== ORACLES ========== */

  function getAssetToEthRate(address assetAddress) public view returns (uint) {

    if (assetAddress == ETH || assetAddress == safeTracker) {
      return 1 ether;
    }

    uint assetId = getAssetId(assetAddress);
    uint rate = _getAssetToEthRate(oracles[assetId]);

    return rate;
  }

  function getAssetForEth(address assetAddress, uint ethIn) external view returns (uint) {

    if (assetAddress == ETH || assetAddress == safeTracker) {
      return ethIn;
    }

    // TODO: this is inefficient, we need to pass the id to this function
    uint assetId = getAssetId(assetAddress);
    uint decimals = assets[assetId].decimals;
    uint rate = _getAssetToEthRate(oracles[assetId]);

    return ethIn * (10 ** decimals) / rate;
  }

  function getEthForAsset(address assetAddress, uint amount) external view returns (uint) {

    if (assetAddress == ETH || assetAddress == safeTracker) {
      return amount;
    }

    uint assetId = getAssetId(assetAddress);
    uint decimals = assets[assetId].decimals;
    uint rate = _getAssetToEthRate(oracles[assetId]);

    return amount * rate / 10 ** decimals;
  }

  function _getAssetToEthRate(Oracle memory oracle) internal view returns (uint) {

    // note: the current implementation relies on off-chain staleness checks
    int rate = oracle.aggregator.latestAnswer();

    if (rate <= 0) {
      revert NonPositiveRate(address(oracle.aggregator), rate);
    }

    // for ETH type oracles, return the rate directly
    if (oracle.aggregatorType == AggregatorType.ETH) {
      return uint(rate);
    }

    // for USD type oracles, convert the USD rate to its equivalent ETH rate using the ETH-USD oracle
    Oracle memory ethOracle = oracles[0];
    int ethUsdRate = ethOracle.aggregator.latestAnswer();

    if (ethUsdRate <= 0) {
      revert NonPositiveRate(address(ethOracle.aggregator), ethUsdRate);
    }

    // todo: this may lead to precision loss
    return uint(rate) * 1 ether / uint(ethUsdRate);
  }

}
