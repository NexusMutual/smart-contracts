// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface Aggregator {
  function decimals() external view returns (uint8);
  function latestAnswer() external view returns (int);
}

struct Asset {
  address assetAddress;
  uint8 decimals;
  bool isCoverAsset;
  bool isAbandoned;
  // 72 bits left
}

enum AggregatorType { ETH, USD }

struct Oracle {
  Aggregator aggregator;
  AggregatorType aggregatorType;
  // 88 bits left
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
  uint8 assetId;
  uint96 amount;
}

struct MCR {
  uint80 mcr;
  uint80 desiredMCR;
  uint32 lastUpdateTime;
}

interface IPool {

  function getAsset(uint assetId) external view returns (Asset memory);

  function getAssets() external view returns (Asset[] memory);

  function transferAssetToSwapOperator(address asset, uint amount) external;

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
    uint mcrFloor,
    uint mcrETHWithGear,
    uint totalSumAssured
  );

  event Payout(address indexed to, address indexed assetAddress, uint amount);

  error RevertedWithoutReason(uint index);
  error AssetNotFound();
  error InvalidAssetId();
  error UnknownParameter();
  error OrderInProgress();
  error AssetAlreadyExists();
  error AssetMustNotBeZeroAddress();
  error EmptyAssetAddresses();
  error OnlySwapOperator();

  error ArgumentLengthMismatch(uint assetAddressesLength, uint aggregatorsLength, uint typesLength, uint decimalsLength);
  error AggregatorMustNotBeZeroAddress();
  error ZeroAddress(string parameter);
  error ZeroDecimals(address asset);
  error IncompatibleAggregatorDecimals(address aggregator, uint8 aggregatorDecimals, uint8 expectedDecimals);
  error UnknownAggregatorType(uint8 aggregatorType);
  error EthUsdAggregatorNotSet();
  error InvalidEthAggregatorType(AggregatorType actual, AggregatorType expected);
  error UnknownAsset(address asset);
  error NonPositiveRate(address aggregator, int rate);

}
