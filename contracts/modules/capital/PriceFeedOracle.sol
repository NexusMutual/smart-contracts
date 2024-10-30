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
    require(_assetAddresses.length > 0, "PriceFeedOracle: asset addresses cannot be empty");
    require(
      _assetAddresses.length == _assetAggregators.length &&
      _assetAggregators.length == _aggregatorTypes.length &&
      _aggregatorTypes.length == _assetDecimals.length,
      "PriceFeedOracle: different args length"
    );
    require(_safeTracker != address(0), "PriceFeedOracle: safeTracker cannot be zero address");

    safeTracker = _safeTracker;
    assetsMap[_safeTracker] = AssetInfo(Aggregator(_safeTracker), AggregatorType.ETH, 18);

    for (uint i = 0; i < _assetAddresses.length; i++) {
      require(_assetAddresses[i] != address(0), "PriceFeedOracle: asset address cannot be zero");
      require(_assetAggregators[i] != address(0), "PriceFeedOracle: aggregator address cannot be zero");

      assetsMap[_assetAddresses[i]] = AssetInfo(
        Aggregator(_assetAggregators[i]),
        _aggregatorTypes[i],
        _assetDecimals[i]
      );
    }

    // Require ETH-USD asset
    AssetInfo memory ethAsset = assetsMap[ETH];
    require(address(ethAsset.aggregator) != address(0), "PriceFeedOracle: ETH/USD aggregator not set");
    require(ethAsset.aggregatorType == AggregatorType.USD, "PriceFeedOracle: ETH aggregator must be USD type");
  }

  /**
   * @dev Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
   * @param assetAddress address of asset
   * @return price in ether
   */
  function getAssetToEthRate(address assetAddress) public view returns (uint) {
    if (assetAddress == ETH || assetAddress == safeTracker) {
      return 1 ether;
    }

    AssetInfo memory asset = assetsMap[assetAddress];
    return _getAssetToEthRate(asset.aggregator, asset.aggregatorType);
  }

  /**
   * @dev Returns the amount of currency that is equivalent to ethIn amount of ether.
   * @param assetAddress address of asset
   * @param ethIn amount of ether to be converted to the asset
   * @return asset amount
   */
  function getAssetForEth(address assetAddress, uint ethIn) external view returns (uint) {
    if (assetAddress == ETH || assetAddress == safeTracker) {
      return ethIn;
    }

    AssetInfo memory asset = assetsMap[assetAddress];
    uint price = _getAssetToEthRate(asset.aggregator, asset.aggregatorType);

    return ethIn * (10 ** uint(asset.decimals)) / price;
  }

  /**
   * @dev Returns the amount of eth that is equivalent to a given asset and amount
   * @param assetAddress address of asset
   * @param amount amount of asset
   * @return amount of ether
   */
  function getEthForAsset(address assetAddress, uint amount) external view returns (uint) {
    if (assetAddress == ETH || assetAddress == safeTracker) {
      return amount;
    }

    AssetInfo memory asset = assetsMap[assetAddress];
    uint price = _getAssetToEthRate(asset.aggregator, asset.aggregatorType);

    return amount * (price) / 10 ** uint(asset.decimals);
  }

  /**
   * @dev Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
   * @param aggregator The asset aggregator
   * @param aggregatorType The asset aggregator type (i.e ETH, USD)
   * @return price in ether
   */
  function _getAssetToEthRate(Aggregator aggregator, AggregatorType aggregatorType) internal view returns (uint) {
    require(address(aggregator) != address(0), "PriceFeedOracle: Unknown asset");
    // TODO: consider checking the latest timestamp and revert if it's *very* old
    int rate = aggregator.latestAnswer();
    require(rate > 0, "PriceFeedOracle: Rate must be > 0");

    if (aggregatorType == AggregatorType.ETH) {
      return uint(rate);
    }

    AssetInfo memory ethAsset = assetsMap[ETH];

    int ethUsdRate = ethAsset.aggregator.latestAnswer();
    require(ethUsdRate > 0, "PriceFeedOracle: ETH/USD rate must be > 0");

    return (uint(rate) * 1e18) / uint(ethUsdRate);
  }

  function assets(address assetAddress) external view returns (Aggregator, uint8) {
    AssetInfo memory asset = assetsMap[assetAddress];
    return (asset.aggregator, asset.decimals);
  }
}
