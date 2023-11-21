// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IPriceFeedOracle.sol";

struct SwapDetails {
  uint104 minAmount;
  uint104 maxAmount;
  uint32 lastSwapTime;
  // 2 decimals of precision. 0.01% -> 0.0001 -> 1e14
  uint16 maxSlippageRatio;
}

struct Asset {
  address assetAddress;
  bool isCoverAsset;
  bool isAbandoned;
}

interface IPool {

  function getAsset(uint assetId) external view returns (Asset memory);

  function getAssets() external view returns (Asset[] memory);

  function transferAssetToSwapOperator(address asset, uint amount) external;

  function setSwapDetailsLastSwapTime(address asset, uint32 lastSwapTime) external;

  function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory);

  function sendPayout(uint assetIndex, address payable payoutAddress, uint amount, uint ethDepositAmount) external;

  function sendEth(address payoutAddress, uint amount) external;

  function upgradeCapitalPool(address payable newPoolAddress) external;

  function priceFeedOracle() external view returns (IPriceFeedOracle);

  function getPoolValueInEth() external view returns (uint);

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) external pure returns (uint);

  function getInternalTokenPriceInAsset(uint assetId) external view returns (uint tokenPrice);

  function getInternalTokenPriceInAssetAndUpdateTwap(uint assetId) external returns (uint tokenPrice);

  function getTokenPrice() external view returns (uint tokenPrice);

  function getMCRRatio() external view returns (uint);

  function setSwapValue(uint value) external;
}
