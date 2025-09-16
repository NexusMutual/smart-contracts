// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IPriceFeedOracle.sol";

contract P1MockPriceFeedOracle is IPriceFeedOracle {
  mapping(address => OracleAggregator) public aggregators;
  mapping(address => AggregatorType) public aggregatorTypes;

  function assetsMap(address assetAddress) external view returns (OracleAggregator, AggregatorType, uint8) {
    OracleAggregator aggregator = aggregators[assetAddress];
    AggregatorType aggregatorType = aggregatorTypes[assetAddress];
    uint8 decimals = aggregator.decimals();
    return( aggregators[assetAddress], aggregatorType, decimals);
  }

  function setAssetAggregator(address assetAddress, address oracleAddress, AggregatorType aggregatorType) external {
    aggregators[assetAddress] = OracleAggregator(oracleAddress);
    aggregatorTypes[assetAddress] = aggregatorType;
  }

  function ETH() external pure returns (address) {
    revert("Unsupported");
  }

  function assets(address) external pure returns (OracleAggregator, uint8) {
    revert("Unsupported");
  }

  function getAssetToEthRate(address) external pure returns (uint) {
    revert("Unsupported");
  }
  function getAssetForEth(address, uint) external pure returns (uint) {
    revert("Unsupported");
  }
  function getEthForAsset(address, uint) external pure returns (uint) {
    revert("Unsupported");
  }
}
