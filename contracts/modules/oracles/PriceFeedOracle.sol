// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../interfaces/IPriceFeedOracle.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface Aggregator {
  function latestAnswer() external view returns (int);
}

contract PriceFeedOracle is IPriceFeedOracle {
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
