// SPDX-License-Identifier: GPL-3.0-only

// TODO: consider upgrading to 0.8 to get rid of the experimental pragma
pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "./IPriceFeedOracle.sol";

interface IPool {

  struct SwapDetails {
    uint104 minAmount;
    uint104 maxAmount;
    uint32 lastSwapTime;
    // 2 decimals of precision. 0.01% -> 0.0001 -> 1e14
    uint16 maxSlippageRatio;
  }

  struct Asset {
    address assetAddress;
    uint8 decimals;
  }

  function investmentAssets(uint index) external view returns (
    address assetAddress,
    uint8 decimals
  );

  function coverAssets(uint index) external view returns (
    address assetAddress,
    uint8 decimals
  );

  function getInvestmentAssets() external view returns (Asset[] memory);

  function getCoverAssets() external view returns (Asset[] memory);

  function buyNXM(uint minTokensOut) external payable;

  function sellNXM(uint tokenAmount, uint minEthOut) external;

  function sellNXMTokens(uint tokenAmount) external returns (bool);

  function minPoolEth() external returns (uint);

  function transferAssetToSwapOperator(address asset, uint amount) external;

  function setSwapDetailsLastSwapTime(address asset, uint32 lastSwapTime) external;

  function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory);

  function getNXMForEth(uint ethAmount) external view returns (uint);

  function sendPayout (
    uint assetIndex,
    address payable payoutAddress,
    uint amount
  ) external;

  function upgradeCapitalPool(address payable newPoolAddress) external;

  function priceFeedOracle() external view returns (IPriceFeedOracle);

  function getPoolValueInEth() external view returns (uint);

  function transferAssetFrom(address asset, address from, uint amount) external;

  function getEthForNXM(uint nxmAmount) external view returns (uint ethAmount);

  function calculateEthForNXM(
    uint nxmAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) external pure returns (uint);

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) external pure returns (uint);

  function calculateTokenSpotPrice(uint totalAssetValue, uint mcrEth) external pure returns (uint tokenPrice);

  function getTokenPrice(uint assetId) external view returns (uint tokenPrice);

  function getMCRRatio() external view returns (uint);

  function setSwapValue(uint value) external;
}
