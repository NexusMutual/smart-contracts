// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface Aggregator {
  function decimals() external view returns (uint8);
  function latestAnswer() external view returns (int);
}

interface IPriceFeedOracle {

  struct OracleAsset {
    Aggregator aggregator;
    uint8 decimals;
  }

  function ETH() external view returns (address);
  function assets(address) external view returns (Aggregator, uint8);

  function getAssetToEthRate(address asset) external view returns (uint);
  function getAssetForEth(address asset, uint ethIn) external view returns (uint);
  function getEthForAsset(address asset, uint amount) external view returns (uint);

}
