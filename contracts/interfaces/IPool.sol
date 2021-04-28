pragma solidity ^0.8.4;

interface IPool {
  function transferAssetTo (address asset, address to, uint amount) external;
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
