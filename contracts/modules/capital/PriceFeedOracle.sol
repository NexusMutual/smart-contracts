// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IPriceFeedOracle.sol";

contract PriceFeedOracle is IPriceFeedOracle {

  mapping(address => AssetInfo) public assetsMap;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address public immutable safeTracker;

  constructor(
    address[] memory _assetAddresses,
    address[] memory _assetAggregators,
    AggregatorType[] memory _aggregatorTypes,
    uint8[] memory _assetDecimals,
    address _safeTracker
  ) {
    if (_assetAddresses.length == 0) {
      revert EmptyAssetAddresses();
    }
    if (
      _assetAddresses.length != _assetAggregators.length ||
      _assetAggregators.length != _aggregatorTypes.length ||
      _aggregatorTypes.length != _assetDecimals.length
    ) {
      revert ArgumentLengthMismatch(
        _assetAddresses.length,
        _assetAggregators.length,
        _aggregatorTypes.length,
        _assetDecimals.length
      );
    }
    if (_safeTracker == address(0)) {
      revert ZeroAddress("safeTracker");
    }

    safeTracker = _safeTracker;
    assetsMap[_safeTracker] = AssetInfo(Aggregator(_safeTracker), AggregatorType.ETH, 18);

    for (uint i = 0; i < _assetAddresses.length; i++) {
      if (_assetAddresses[i] == address(0)) {
        revert ZeroAddress("assetAddress");
      }
      if (_assetAggregators[i] == address(0)) {
        revert ZeroAddress("aggregator");
      }
      if (_assetDecimals[i] == 0) {
        revert ZeroDecimals(_assetAddresses[i]);
      }

      Aggregator aggregator = Aggregator(_assetAggregators[i]);
      uint8 aggregatorDecimals = aggregator.decimals();

      if (_aggregatorTypes[i] != AggregatorType.ETH && _aggregatorTypes[i] != AggregatorType.USD) {
          revert UnknownAggregatorType(uint8(_aggregatorTypes[i]));
      }
      if (_aggregatorTypes[i] == AggregatorType.ETH && aggregatorDecimals != 18) {
          revert InvalidAggregatorDecimals(_assetAggregators[i], aggregatorDecimals, 18);
      }
      if (_aggregatorTypes[i] == AggregatorType.USD && aggregatorDecimals != 8) {
          revert InvalidAggregatorDecimals(_assetAggregators[i], aggregatorDecimals, 8);
      }

      assetsMap[_assetAddresses[i]] = AssetInfo(aggregator, _aggregatorTypes[i], _assetDecimals[i]);
    }

    // Require ETH-USD asset
    AssetInfo memory ethAsset = assetsMap[ETH];
    if (address(ethAsset.aggregator) == address(0)) {
      revert EthUsdAggregatorNotSet();
    }
    if (ethAsset.aggregatorType != AggregatorType.USD) {
      revert InvalidEthAggregatorType(ethAsset.aggregatorType, AggregatorType.USD);
    }
  }

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

    AssetInfo memory ethAsset = assetsMap[ETH];

    int ethUsdRate = ethAsset.aggregator.latestAnswer();
    if (ethUsdRate <= 0) {
      revert NonPositiveRate(ETH, ethUsdRate);
    }

    return (uint(rate) * 1e18) / uint(ethUsdRate);
  }

  /// @notice Retrieves the aggregator and decimals for a specific asset
  /// @param assetAddress address of the asset
  /// @return Aggregator instance and decimals of the asset
  function assets(address assetAddress) external view returns (Aggregator, uint8) {
    AssetInfo memory asset = assetsMap[assetAddress];
    return (asset.aggregator, asset.decimals);
  }
}
