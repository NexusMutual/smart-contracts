/* Copyright (C) 2020 NexusMutual.io
  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.0;

contract Aggregator {
  function latestAnswer() public view returns (int);
}

contract PriceFeedOracle {

  mapping (bytes4 => address) public chainlinkAggregators;

  constructor (bytes4[] memory assets, address[] memory _chainlinkAggregators) public {
    require(assets.length == _chainlinkAggregators.length, "assets and _chainlinkAggregators need to have same length");
    for (uint i = 0; i < assets.length; i++) {
      chainlinkAggregators[assets[i]] = _chainlinkAggregators[i];
    }
  }

  /**
   * @dev Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
   * @param asset quoted currency
   * @return price in ether
   */
  function getETHToAssetRate(bytes4 asset) external view returns (uint) {

    if (asset == "ETH") {
      return 1 ether;
    }

    address aggregatorAddress = chainlinkAggregators[asset];
    if (aggregatorAddress == address(0)) {
      revert("Oracle asset not found");
    }
    Aggregator aggregator = Aggregator(aggregatorAddress);
    int rate = aggregator.latestAnswer();
    require(rate > 0, "Rate must be > 0");
    return uint(1e36 / rate);
  }

  /**
   * @dev Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
   * @param asset quoted currency
   * @return price in ether
   */
  function getAssetToETHRate(bytes4 asset) external view returns (uint) {

    if (asset == "ETH") {
      return 1 ether;
    }

    address aggregatorAddress = chainlinkAggregators[asset];
    if (aggregatorAddress == address(0)) {
      revert("Oracle asset not found");
    }
    Aggregator aggregator = Aggregator(aggregatorAddress);
    int rate = aggregator.latestAnswer();
    require(rate > 0, "Rate must be > 0");
    return uint(rate);
  }
}
