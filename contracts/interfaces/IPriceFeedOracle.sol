// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface OracleAggregator {
  function decimals() external view returns (uint8);
  function latestAnswer() external view returns (int);
}

interface IPriceFeedOracle {

  enum AggregatorType { ETH, USD }

  struct AssetInfo {
    OracleAggregator aggregator;
    AggregatorType aggregatorType;
    uint8 decimals;
  }

  function ETH() external view returns (address);
  function assets(address) external view returns (OracleAggregator, uint8);
  function assetsMap(address) external view returns (OracleAggregator, AggregatorType, uint8);

  function getAssetToEthRate(address asset) external view returns (uint);
  function getAssetForEth(address asset, uint ethIn) external view returns (uint);
  function getEthForAsset(address asset, uint amount) external view returns (uint);

  /* ========== ERRORS ========== */

  error EmptyAssetAddresses();
  error ArgumentLengthMismatch(uint assetAddressesLength, uint aggregatorsLength, uint typesLength, uint decimalsLength);
  error ZeroAddress(string parameter);
  error ZeroDecimals(address asset);
  error IncompatibleAggregatorDecimals(address aggregator, uint8 aggregatorDecimals, uint8 expectedDecimals);
  error UnknownAggregatorType(uint8 aggregatorType);
  error EthUsdAggregatorNotSet();
  error InvalidEthAggregatorType(AggregatorType actual, AggregatorType expected);
  error UnknownAsset(address asset);
  error NonPositiveRate(address aggregator, int rate);
}
