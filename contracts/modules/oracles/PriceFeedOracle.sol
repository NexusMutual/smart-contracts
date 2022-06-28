// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../interfaces/IPriceFeedOracle.sol";

interface Aggregator {
  function latestAnswer() external view returns (int);
}

contract PriceFeedOracle is IPriceFeedOracle {
  using SafeMath for uint;

  struct Asset {
    address aggregator;
    uint8 decimals;
  }

  mapping(address => Asset) public assets;
  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor (
    address[] memory assetAddresses,
    address[] memory aggregators,
    uint8[] memory decimals
  ) public {

    for (uint i = 0; i < assetAddresses.length; i++) {
      assets[assetAddresses[i]] = Asset(aggregators[i], decimals[i]);
    }
  }

  /**
   * @dev Returns the amount of ether in wei that are equivalent to 1 unit (10 ** decimals) of asset
   * @param asset quoted currency
   * @return price in ether
   */
  function getAssetToEthRate(address asset) public view returns (uint) {

    if (asset == ETH) {
      return 1 ether;
    }

    address aggregatorAddress = assets[asset].aggregator;

    if (aggregatorAddress == address(0)) {
      revert("PriceFeedOracle: Oracle asset not found");
    }

    int rate = Aggregator(aggregatorAddress).latestAnswer();
    require(rate > 0, "PriceFeedOracle: Rate must be > 0");

    return uint(rate);
  }

  /**
  * @dev Returns the amount of currency that is equivalent to ethIn amount of ether.
  * @param assetAddress quoted asset
  * @param ethIn amount of ether to be converted to the currency
  * @return price in ether
  */
  function getAssetForEth(address assetAddress, uint ethIn) external view returns (uint) {

    if (assetAddress == ETH) {
      return ethIn;
    }

    Asset memory asset = assets[assetAddress];
    require(asset.decimals > 0, "PriceFeedOracle: Unknown asset");

    int rate = Aggregator(asset.aggregator).latestAnswer();
    require(rate > 0, "PriceFeedOracle: Rate must be > 0");

    return ethIn.mul(10 ** uint(asset.decimals)).div(uint(rate));
  }

}
