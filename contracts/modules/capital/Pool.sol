// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../abstract/ReentrancyGuard.sol";
import "../../abstract/RegistryAware.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ILegacyMCR.sol";
import "../../interfaces/ILegacyPool.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/IRamm.sol";
import "../../interfaces/ISafeTracker.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract Pool is IPool, ReentrancyGuard, RegistryAware {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  /* storage */

  Asset[] public assets;
  mapping(address assetAddress => Oracle) public oracles;

  // 1 slot
  AssetInSwapOperator public assetInSwapOperator;
  MCR internal mcr;

  /* immutables */

  ICover public immutable cover;
  IRamm public immutable ramm;
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

  /* ========== CONSTRUCTOR ========== */

  constructor (address _registry) RegistryAware(_registry) {
    cover = ICover(fetch(C_COVER));
    ramm = IRamm(fetch(C_RAMM));
    swapOperator = fetch(C_SWAP_OPERATOR);
    safeTracker = fetch(C_SAFE_TRACKER);
  }

  receive() external payable {}

  /* ========== ASSETS ========== */

  ///
  /// @dev Calculates total value of all pool assets in ether
  ///
  function getPoolValueInEth() public override view returns (uint) {

    uint total = address(this).balance;

    uint assetCount = assets.length;
    uint swappedAmount = assetInSwapOperator.amount;
    address swappedAsset = assetInSwapOperator.assetAddress;

    for (uint i = 0; i < assetCount; i++) {

      // check if the asset is ETH and exit the loop early
      // it's assumed we don't abandon ETH
      if (i == 0) {
        total += swappedAsset == ETH ? swappedAmount : 0;
        continue;
      }

      Asset memory asset = assets[i];

      if (asset.isAbandoned) {
        continue;
      }

      address assetAddress = asset.assetAddress;
      uint assetBalance = swappedAsset == assetAddress ? swappedAmount : 0;

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
  ) external onlyContracts(C_GOVERNOR) {
    _addAsset(assetAddress, isCoverAsset, aggregator, aggregatorType);
  }

  function _addAsset(
    address assetAddress,
    bool isCoverAsset,
    Aggregator aggregator,
    AggregatorType aggregatorType
  ) internal {

    require(assetAddress != address(0), AssetMustNotBeZeroAddress());
    require(address(aggregator) != address(0), AggregatorMustNotBeZeroAddress());

    // check if it already exists
    uint assetCount = assets.length;

    for (uint i = 0; i < assetCount; i++) {
      require(assetAddress != assets[i].assetAddress, AssetAlreadyExists());
    }

    uint assetDecimals = assetAddress == ETH ? 18 : IERC20Metadata(assetAddress).decimals();
    uint aggregatorDecimals = aggregator.decimals();

    if (aggregatorType == AggregatorType.ETH && aggregatorDecimals != 18) {
      revert IncompatibleAggregatorDecimals(address(aggregator), 18, aggregatorDecimals);
    }

    if (aggregatorType == AggregatorType.USD && aggregatorDecimals != 8) {
      revert IncompatibleAggregatorDecimals(address(aggregator), 8, aggregatorDecimals);
    }

    // store asset
    assets.push(Asset({
      assetAddress: assetAddress,
      isCoverAsset: isCoverAsset,
      isAbandoned: false
    }));

    // store oracle
    oracles[assetAddress] = Oracle({
      aggregator: aggregator,
      aggregatorType: aggregatorType,
      assetDecimals: assetDecimals.toUint8()
    });
  }

  function setAssetDetails(
    uint assetId,
    bool isCoverAsset,
    bool isAbandoned
  ) external override onlyContracts(C_GOVERNOR) {
    require(assets.length > assetId, InvalidAssetId());
    assets[assetId].isCoverAsset = isCoverAsset;
    assets[assetId].isAbandoned = isAbandoned;
  }

  /* ========== INVESTMENT SAFE ========== */

  function transferAssetToSafe(
    address assetAddress,
    address safeAddress,
    uint amount
  ) external override onlyContracts(C_SAFE_TRACKER) whenNotPaused(PAUSE_GLOBAL) nonReentrant {

    if (assetAddress == ETH) {
      (bool ok, /* data */) = safeAddress.call{value: amount}("");
      require(ok, EthTransferFailed(safeAddress, amount));
      return;
    }

    IERC20(assetAddress).safeTransfer(safeAddress, amount);
    emit AssetsTransferredToSafe(assetAddress, amount);
  }

  /* ========== SWAP OPERATOR ========== */

  function transferAssetToSwapOperator(
    address assetAddress,
    uint amount
  ) external override onlyContracts(C_SWAP_OPERATOR) whenNotPaused(PAUSE_GLOBAL) nonReentrant {

    require(assetInSwapOperator.amount == 0, OrderInProgress());

    assetInSwapOperator = AssetInSwapOperator({
      assetAddress: assetAddress,
      amount: amount.toUint96()
    });

    if (assetAddress == ETH) {
      (bool ok, /* data */) = swapOperator.call{value: amount}("");
      require(ok, EthTransferFailed(swapOperator, amount));
      return;
    }

    IERC20(assetAddress).safeTransfer(swapOperator, amount);
    emit AssetsTransferredToSwapOperator(assetAddress, amount);
  }

  function clearSwapAssetAmount(
    address assetAddress
  ) external override onlyContracts(C_SWAP_OPERATOR) whenNotPaused(PAUSE_GLOBAL) {
    require(assetInSwapOperator.assetAddress == assetAddress, InvalidAssetId());
    require(assetInSwapOperator.amount != 0, NoSwapAssetAmountFound());
    delete assetInSwapOperator;
  }

  /* ========== CLAIMS ========== */

  /// @dev Executes a payout
  /// @param assetId        Index of the cover asset
  /// @param payoutAddress  Send funds to this address
  /// @param amount         Amount to send
  /// @param depositInETH   Deposit in ETH
  ///
  function sendPayout(
    uint assetId,
    address payable payoutAddress,
    uint amount,
    uint depositInETH
  ) external override onlyContracts(C_CLAIMS) nonReentrant {

    Asset memory asset = assets[assetId];

    if (asset.assetAddress != ETH) {
      IERC20(asset.assetAddress).safeTransfer(payoutAddress, amount);
    }

    uint ethAmountToSend = depositInETH + (asset.assetAddress == ETH ? amount : 0);
    if (ethAmountToSend > 0) {
      (bool ok, /* data */) = payoutAddress.call{value: ethAmountToSend}("");
      require(ok, EthTransferFailed(payoutAddress, ethAmountToSend));
    }

    emit Payout(payoutAddress, asset.assetAddress, amount);

    if (amount > 0) {
      _updateMCR(true);
    }
  }

  /* ========== TOKEN AND RAMM ========== */

  /// @dev Sends ETH to a member in exchange for NXM tokens.
  /// @param member  Member address
  /// @param amount  Amount of ETH to send
  ///
  function sendEth(address payable member, uint amount) external override onlyContracts(C_RAMM) nonReentrant {
    (bool transferSucceeded, /* data */) = member.call{value: amount}("");
    require(transferSucceeded, EthTransferFailed(member, amount));
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

    require(assetId < assets.length, InvalidAssetId());
    address assetAddress = assets[assetId].assetAddress;

    uint internalTokenPrice = ramm.getInternalPrice();

    return getAssetForEth(assetAddress, internalTokenPrice);
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

    require(assetId < assets.length, InvalidAssetId());
    address assetAddress = assets[assetId].assetAddress;

    uint internalTokenPrice = ramm.getInternalPriceAndUpdateTwap();

    return getAssetForEth(assetAddress, internalTokenPrice);
  }

  /// [deprecated] Returns spot NXM price in ETH from ramm contract.
  ///
  /// @dev The pool contract is not a proxy and its address will change as we upgrade it.
  /// @dev You may want TokenController.getTokenPrice() for a stable address since it's a proxy.
  ///
  function getTokenPrice() public override view returns (uint tokenPrice) {
    (, tokenPrice) = ramm.getSpotPrices();
    return tokenPrice;
  }

  /* ========== MCR ========== */

  function getTotalActiveCoverAmount() public view returns (uint) {

    uint totalActiveCoverAmountInEth = cover.totalActiveCoverInAsset(0);

    Asset[] memory _assets = assets;

    // skip the first asset - it's ETH, it's already accounted for above
    for (uint i = 1; i < _assets.length; i++) {
      uint activeCoverAmount = cover.totalActiveCoverInAsset(i);
      uint assetAmountInEth = getEthForAsset(_assets[i].assetAddress, activeCoverAmount);
      totalActiveCoverAmountInEth += assetAmountInEth;
    }

    return totalActiveCoverAmountInEth;
  }

  function _updateMCR(bool forceUpdate) internal {

    uint stored = mcr.stored;
    uint desired = mcr.desired;
    uint updatedAt = mcr.updatedAt;

    if (!forceUpdate && block.timestamp < updatedAt + MIN_UPDATE_TIME) {
      return;
    }

    // store the current mcr value
    uint current = calculateCurrentMCR(stored, desired, updatedAt, block.timestamp);

    if (current != stored) {
      stored = current;
    }

    uint totalActiveCoverAmount = getTotalActiveCoverAmount();
    uint geared = totalActiveCoverAmount * BASIS_PRECISION / GEARING_FACTOR;

    if (geared != desired) {
      desired = geared;
    }

    mcr.stored = stored.toUint80();
    mcr.desired = desired.toUint80();
    mcr.updatedAt = block.timestamp.toUint32();

    // sstore
    emit MCRUpdated(mcr.stored, mcr.desired, 0, geared, totalActiveCoverAmount);
  }

  function calculateCurrentMCR(
    uint stored,
    uint desired,
    uint updatedAt,
    uint _now
  ) public pure returns (uint) {

    if (_now == updatedAt) {
      return stored;
    }

    uint changeBps = Math.min(
      MAX_MCR_INCREMENT * (_now - updatedAt) / 1 days,
      MAX_MCR_ADJUSTMENT
    );

    return desired > stored
      ? Math.min(stored * (changeBps + BASIS_PRECISION) / BASIS_PRECISION, desired)
      : Math.max(stored * (BASIS_PRECISION - changeBps) / BASIS_PRECISION, desired);
  }

  function getMCRRatio() public override view returns (uint) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = getMCR();
    return totalAssetValue * (10 ** MCR_RATIO_DECIMALS) / mcrEth;
  }

  function getMCR() public view returns (uint) {
    return calculateCurrentMCR(mcr.stored, mcr.desired, mcr.updatedAt, block.timestamp);
  }

  function updateMCR() public whenNotPaused(PAUSE_GLOBAL) {
    _updateMCR(false);
  }

  function updateMCRInternal(
    bool forceUpdate
  ) public onlyContracts(C_RAMM) whenNotPaused(PAUSE_GLOBAL) {
    _updateMCR(forceUpdate);
  }

  /* ========== ORACLES ========== */

  function getAssetForEth(address assetAddress, uint ethIn) public view returns (uint) {

    if (assetAddress == ETH) {
      return ethIn;
    }

    Oracle memory oracle = oracles[assetAddress];
    uint rate = _getAssetToEthRate(oracle);

    return ethIn * (10 ** oracle.assetDecimals) / rate;
  }

  function getEthForAsset(address assetAddress, uint amount) public view returns (uint) {

    if (assetAddress == ETH) {
      return amount;
    }

    Oracle memory oracle = oracles[assetAddress];
    uint rate = _getAssetToEthRate(oracle);

    return amount * rate / 10 ** oracle.assetDecimals;
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
    Oracle memory ethOracle = oracles[ETH];
    int ethUsdRate = ethOracle.aggregator.latestAnswer();

    if (ethUsdRate <= 0) {
      revert NonPositiveRate(address(ethOracle.aggregator), ethUsdRate);
    }

    // todo: this may lead to precision loss
    return uint(rate) * 1 ether / uint(ethUsdRate);
  }

  /* ========== MIGRATION ========== */

  function migrate(
    address _previousPool,
    address _previousMCR
  ) external {

    // registry doesn't know the master address, fetching it from the cover products contract
    address coverProducts = address(cover.coverProducts());
    address masterAddress = address(MasterAwareV2(coverProducts).master());
    require(msg.sender == masterAddress, 'Pool: Unauthorized');
    require(assets.length == 0, AlreadyMigrated());

    ILegacyPool previousPool = ILegacyPool(_previousPool);
    ILegacyMCR previousMCR = ILegacyMCR(_previousMCR);

    ILegacyPool.Asset[] memory _assets = previousPool.getAssets();
    IPriceFeedOracle priceFeedOracle = previousPool.priceFeedOracle();
    address DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;

    // copy assets and oracles from the previous Pool

    for (uint i = 0; i < _assets.length; i++) {
      (
        OracleAggregator aggregator,
        IPriceFeedOracle.AggregatorType aggregatorType,
        /* uint8 assetDecimals */
      ) = priceFeedOracle.assetsMap(_assets[i].assetAddress);

      _addAsset(
        _assets[i].assetAddress,
        _assets[i].isCoverAsset,
        Aggregator(address(aggregator)),
        AggregatorType(uint8(aggregatorType))
      );

      if (_assets[i].assetAddress == DAI) {
        assets[i].isAbandoned = true;
      }
    }

    // update MCR and copy MCR values

    previousMCR.updateMCRInternal(true);

    uint stored = previousMCR.getMCR(); // returns stored given we've just updated it
    uint desired = previousMCR.desiredMCR();
    uint updatedAt = previousMCR.lastUpdateTime();

    mcr.stored = stored.toUint80();
    mcr.desired = desired.toUint80();
    mcr.updatedAt = updatedAt.toUint32();
  }

}
