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
  uint8 decimals;
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

interface IPool {

  function swapOperator() external view returns (address);

  function getAsset(uint assetId) external view returns (Asset memory);

  function getAssets() external view returns (Asset[] memory);

  function transferAssetToSwapOperator(address asset, uint amount) external;

  function setSwapDetailsLastSwapTime(address asset, uint32 lastSwapTime) external;

  function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory);

  function sendPayout(uint assetIndex, address payable payoutAddress, uint amount, uint ethDepositAmount) external;

  function sendEth(address payoutAddress, uint amount) external;

  function getPoolValueInEth() external view returns (uint);

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) external pure returns (uint);

  function getInternalTokenPriceInAsset(uint assetId) external view returns (uint tokenPrice);

  function getInternalTokenPriceInAssetAndUpdateTwap(uint assetId) external returns (uint tokenPrice);

  function getTokenPrice() external view returns (uint tokenPrice);

  function getMCRRatio() external view returns (uint);

  function setSwapAssetAmount(address assetAddress, uint value) external;

  event MCRUpdated(
    uint mcr,
    uint desiredMCR,
    uint mcrFloor,  // unused
    uint mcrETHWithGear,
    uint totalSumAssured
  );

  event Payout(address indexed to, address indexed assetAddress, uint amount);

  error RevertedWithoutReason(uint index);
  error AssetNotFound();
  error UnknownParameter();
  error OrderInProgress();
}
