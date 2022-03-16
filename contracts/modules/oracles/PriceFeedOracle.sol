// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../interfaces/IPriceFeedOracle.sol";

interface Aggregator {
  function latestAnswer() external view returns (int256);
}

contract PriceFeedOracle is IPriceFeedOracle {
  using SafeMath for uint256;

  mapping(address => Aggregator) public assetAggregators;
  mapping(address => uint256) public assetDecimals;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor(
    address[] memory _assetAddresses,
    address[] memory _assetAggregators,
    uint256[] memory _assetDecimals
  ) public {
    require(
      _assetAddresses.length == _assetAggregators.length && _assetAggregators.length == _assetDecimals.length,
      "PriceFeedOracle: different args length"
    );

    for (uint256 i = 0; i < _assetAddresses.length; i++) {
      assetAggregators[_assetAddresses[i]] = Aggregator(_assetAggregators[i]);
      assetDecimals[_assetAddresses[i]] = _assetDecimals[i];
    }
  }

  /**
   * @dev Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
   * @param asset quoted currency
   * @return price in ether
   */
  function getAssetToEthRate(address asset) public view returns (uint256) {
    if (asset == ETH) {
      return 1 ether;
    }

    Aggregator aggregator = assetAggregators[asset];
    require(address(aggregator) != address(0), "PriceFeedOracle: Unknown asset");

    int256 rate = aggregator.latestAnswer();
    require(rate > 0, "PriceFeedOracle: Rate must be > 0");

    return uint256(rate);
  }

  /**
   * @dev Returns the amount of currency that is equivalent to ethIn amount of ether.
   * @param asset address of asset
   * @param ethIn amount of ether to be converted to the asset
   * @return asset amount
   */
  function getAssetForEth(address asset, uint256 ethIn) external view returns (uint256) {
    if (asset == ETH) {
      return ethIn;
    }

    uint256 decimals = assetDecimals[asset];
    uint256 price = getAssetToEthRate(asset);

    return ethIn.mul(10**decimals).div(price);
  }

  /**
   * @dev Returns the amount of eth that is equivalent to a given asset and amount
   * @param asset address of asset
   * @param amount amount of asset
   * @return amount of ether
   */
  function getEthForAsset(address asset, uint amount) external view returns (uint) {
    if (asset == ETH) {
      return amount;
    }

    uint256 decimals = assetDecimals[asset];
    uint256 price = getAssetToEthRate(asset);

    return amount.mul(price).div(10**decimals);
  }

  function daiAddress() external view returns (address) {
    return address(0);
  }
}
