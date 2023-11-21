// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IPriceFeedOracle.sol";

interface ILegacyPool {

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

  function getAsset(uint assetId) external view returns (Asset memory);

  function getAssets() external view returns (Asset[] memory);

  function buyNXM(uint minTokensOut) external payable;

  function sellNXM(uint tokenAmount, uint minEthOut) external;

  function sellNXMTokens(uint tokenAmount) external returns (bool);

  function transferAssetToSwapOperator(address asset, uint amount) external;

  function setSwapDetailsLastSwapTime(address asset, uint32 lastSwapTime) external;

  function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory);

  function getNXMForEth(uint ethAmount) external view returns (uint);

  function sendPayout(uint assetIndex, address payable payoutAddress, uint amount) external;

  function upgradeCapitalPool(address payable newPoolAddress) external;

  function priceFeedOracle() external view returns (IPriceFeedOracle);

  function getPoolValueInEth() external view returns (uint);

  function getEthForNXM(uint nxmAmount) external view returns (uint ethAmount);

  function calculateEthForNXM(uint nxmAmount, uint currentTotalAssetValue, uint mcrEth) external pure returns (uint);

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) external pure returns (uint);

  function calculateTokenSpotPrice(uint totalAssetValue, uint mcrEth) external pure returns (uint tokenPrice);

  function getTokenPriceInAsset(uint assetId) external view returns (uint tokenPrice);

  function getTokenPrice() external view returns (uint tokenPrice);

  function getMCRRatio() external view returns (uint);

  function setSwapValue(uint value) external;
}
