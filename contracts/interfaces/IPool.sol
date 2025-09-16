// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface Aggregator {
  function decimals() external view returns (uint8);
  function latestAnswer() external view returns (int);
}

struct Asset {
  address assetAddress;
  bool isCoverAsset;
  bool isAbandoned;
  // 80 bits left
}

enum AggregatorType { ETH, USD }

struct Oracle {
  Aggregator aggregator;
  AggregatorType aggregatorType;
  uint8 assetDecimals;
  // 80 bits left
}

struct OrderIntent {
  uint8 sellAsset;
  uint8 buyAsset;
  uint96 sellAmount;
  uint96 buyAmount;
  uint16 slippage; // bps
  uint32 deadline;
}

struct AssetInSwapOperator {
  address assetAddress;
  uint96 amount;
}

struct MCR {
  uint80 stored;
  uint80 desired;
  uint32 updatedAt;
}

interface IPool {

  function getAsset(uint assetId) external view returns (Asset memory);

  function getAssets() external view returns (Asset[] memory);

  function addAsset(address assetAddress, bool isCoverAsset, Aggregator aggregator, AggregatorType aggregatorType) external;

  function setAssetDetails(uint assetId, bool isCoverAsset, bool isAbandoned) external;

  function sendPayout(uint assetIndex, address payable payoutAddress, uint amount, uint depositInETH) external;

  function sendEth(address payable payoutAddress, uint amount) external;

  function getPoolValueInEth() external view returns (uint);

  function getInternalTokenPriceInAsset(uint assetId) external view returns (uint tokenPrice);

  function getInternalTokenPriceInAssetAndUpdateTwap(uint assetId) external returns (uint tokenPrice);

  function getTokenPrice() external view returns (uint tokenPrice);

  function getMCRRatio() external view returns (uint);

  function getMCR() external view returns (uint);

  function transferAssetToSafe(address assetAddress, address safeAddress, uint amount) external;

  function transferAssetToSwapOperator(address assetAddress, uint amount) external;

  function clearSwapAssetAmount(address assetAddress) external;

  function getAssetForEth(address assetAddress, uint amount) external view returns (uint);

  function getEthForAsset(address assetAddress, uint amount) external view returns (uint);

  function updateMCR() external;

  function updateMCRInternal(bool forceUpdate) external;

  function migrate(address previousPool, address previousMCR) external;

  event MCRUpdated(
    uint mcr,
    uint desiredMCR,
    uint mcrFloor,
    uint mcrETHWithGear,
    uint totalSumAssured
  );

  event Payout(address indexed to, address indexed assetAddress, uint amount);
  event AssetsTransferredToSafe(address assetAddress, uint amount);
  event AssetsTransferredToSwapOperator(address assetAddress, uint amount);

  // migrations
  error AlreadyMigrated();

  // swaps
  error AssetNotFound();
  error InvalidAssetId();
  error OrderInProgress();
  error AssetMustNotBeZeroAddress();
  error AssetAlreadyExists();
  error NoSwapAssetAmountFound();

  // payout
  error EthTransferFailed(address to, uint amount);

  // price feed
  error AggregatorMustNotBeZeroAddress();
  error IncompatibleAggregatorDecimals(address aggregator, uint expectedDecimals, uint aggregatorDecimals);
  error InvalidEthAggregatorType(AggregatorType actual, AggregatorType expected);
  error NonPositiveRate(address aggregator, int rate);

}
