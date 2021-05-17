// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.0;

interface IPool {
  function transferAssetToSwapOperator (address asset, uint amount) external;
  function setAssetDataLatestLastSwapTime(address asset, uint32 lastSwapTime) external;

  function getAssetDetails(address _asset) external view returns (
    uint balance,
    uint112 min,
    uint112 max,
    uint32 lastAssetSwapTime,
    uint maxSlippageRatio
  );

  function setAssetDataLastSwapTime(address asset, uint32 lastSwapTime) external;

  function minPoolEth() external returns (uint);
}
