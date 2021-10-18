// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IPriceFeedOracle.sol";

interface IPool {

  struct AssetSwapData {
    uint104 minAmount;
    uint104 maxAmount;
    uint32 lastSwapTime;
    // 2 decimals of precision. 0.01% -> 0.0001 -> 1e14
    uint16 maxSlippageRatio;
  }

  struct Asset {
    address assetAddress;
    uint8 decimals;
    bool deprecated;
  }

  function assets(uint index) external view returns (address);

  function sellNXM(uint tokenAmount, uint minEthOut) external;

  function sellNXMTokens(uint tokenAmount) external returns (bool);

  function minPoolEth() external returns (uint);

  function transferAssetToSwapOperator(address asset, uint amount) external;

  function setAssetSwapDataLastSwapTime(address asset, uint32 lastSwapTime) external;

  function getAssetSwapDetails(address assetAddress) external view returns (
    uint104 min,
    uint104 max,
    uint32 lastAssetSwapTime,
    uint16 maxSlippageRatio
  );

  function sendClaimPayout (
    uint assetId,
    address payable payoutAddress,
    uint amount
  ) external returns (bool success);

  function transferAsset(
    address asset,
    address payable destination,
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
  ) external view returns (uint);

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) external pure returns (uint);

  function calculateTokenSpotPrice(uint totalAssetValue, uint mcrEth) external view returns (uint tokenPrice);

  function getTokenPrice(uint assetId) external view returns (uint tokenPrice);

  function getMCRRatio() external view returns (uint);
}
