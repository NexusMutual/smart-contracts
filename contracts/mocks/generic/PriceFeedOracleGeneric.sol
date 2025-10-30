// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IPriceFeedOracle.sol";

contract PriceFeedOracleGeneric is IPriceFeedOracle {

  function ETH() external virtual view returns (address) {
    revert("Unsupported");
  }

  function assets(address) external virtual view returns (OracleAggregator, uint8) {
    revert("Unsupported");
  }

  function assetsMap(address) external virtual view returns (OracleAggregator, AggregatorType, uint8) {
    revert("Unsupported");
  }

  function getAssetToEthRate(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getAssetForEth(address, uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getEthForAsset(address, uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

}
