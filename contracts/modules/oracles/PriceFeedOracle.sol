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

import "@openzeppelin/contracts/math/SafeMath.sol";

interface Aggregator {
  function latestAnswer() external view returns (int);
}

contract PriceFeedOracle {
  using SafeMath for uint;

  mapping(address => address) public aggregators;
  address public daiAddress;
  address public stETH;
  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor (
    address _daiAggregator,
    address _daiAddress,
    address _stEthAddress
  ) public {
    aggregators[_daiAddress] = _daiAggregator;
    daiAddress = _daiAddress;
    stETH = _stEthAddress;
  }

  /**
   * @dev Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
   * @param asset quoted currency
   * @return price in ether
   */
  function getAssetToEthRate(address asset) public view returns (uint) {

    if (asset == ETH || asset == stETH) {
      return 1 ether;
    }

    address aggregatorAddress = aggregators[asset];

    if (aggregatorAddress == address(0)) {
      revert("PriceFeedOracle: Oracle asset not found");
    }

    int rate = Aggregator(aggregatorAddress).latestAnswer();
    require(rate > 0, "PriceFeedOracle: Rate must be > 0");

    return uint(rate);
  }

  /**
  * @dev Returns the amount of currency that is equivalent to ethIn amount of ether.
  * @param asset quoted  Supported values: ["DAI", "ETH"]
  * @param ethIn amount of ether to be converted to the currency
  * @return price in ether
  */
  function getAssetForEth(address asset, uint ethIn) external view returns (uint) {

    if (asset == daiAddress) {
      return ethIn.mul(1e18).div(getAssetToEthRate(daiAddress));
    }

    if (asset == ETH || asset == stETH) {
      return ethIn;
    }

    revert("PriceFeedOracle: Unknown asset");
  }

}
