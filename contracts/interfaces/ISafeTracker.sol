// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/extensions/IERC20Metadata.sol";

interface SafeAggregator {
  function decimals() external view returns (uint8);
  function latestAnswer() external view returns (int);
}

interface ISafeTracker is IERC20Metadata {

  struct SafeAsset {
    address assetAddress;
    bool isAbandoned;
    // 88 bits left
  }

  struct SafeOracle {
    SafeAggregator aggregator;
    uint8 assetDecimals;
    // 88 bits left
  }

  function safe() external view returns (address);

  /* ========== ASSETS ========== */

  function getAsset(uint assetId) external view returns (SafeAsset memory);

  function getAssets() external view returns (SafeAsset[] memory);

  function getAssetId(address assetAddress) external view returns (uint);

  function getEthForAsset(address assetAddress, uint amount) external view returns (uint);

  function addAsset(address assetAddress, SafeAggregator aggregator) external;

  function setAssetOracle(address assetAddress, SafeAggregator aggregator) external;

  function setAssetDetails(uint assetId, bool isAbandoned) external;

  /* ========== EVENTS ========== */

  event OffchainInvestmentUSDCUpdated(uint investedUSDC);
  event AssetAdded(address indexed assetAddress, address aggregator);
  event AssetOracleUpdated(address indexed assetAddress, address aggregator);
  event AssetDetailsUpdated(uint indexed assetId, bool isAbandoned);

  /* ========== ERRORS ========== */

  error OnlySafe();
  error InvestmentSurpassesLimit();
  error AmountExceedsBalance();

  // assets
  error AssetMustNotBeZeroAddress();
  error AssetMustNotBeETH();
  error AssetAlreadyTracked();
  error AssetAlreadyExists();
  error AssetNotFound();
  error InvalidAssetId();

  // oracles
  error AggregatorMustNotBeZeroAddress();
  error IncompatibleAggregatorDecimals(address aggregator, uint expectedDecimals, uint aggregatorDecimals);
  error NonPositiveRate(address aggregator, int rate);
}
