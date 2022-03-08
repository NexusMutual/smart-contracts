// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import '../../interfaces/IPriceFeedOracle.sol';
import '../../modules/oracles/PriceFeedOracle.sol';

contract P1MockPriceFeedOracle is PriceFeedOracle {
  constructor(
    address _daiAggregator,
    address _daiAddress,
    address _stEthAddress
  ) public PriceFeedOracle(_daiAggregator, _daiAddress, _stEthAddress) {}

  function getAssetToEthRate(address asset) public view returns (uint256) {
    if (asset == ETH || asset == stETH) {
      return 1 ether;
    }

    address aggregatorAddress = aggregators[asset];

    if (aggregatorAddress == address(0)) {
      return 1 ether; // for unknown assets, mock conversion rate 1:1 with eth
    }

    int256 rate = Aggregator(aggregatorAddress).latestAnswer();

    require(rate > 0, 'PriceFeedOracle: Rate must be > 0');
    return uint256(rate);
  }
}
