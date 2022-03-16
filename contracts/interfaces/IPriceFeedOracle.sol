// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IPriceFeedOracle {

  function ETH() external view returns (address);

  function getAssetToEthRate(address asset) external view returns (uint);
  function getAssetForEth(address asset, uint ethIn) external view returns (uint);
  function getEthForAsset(address asset, uint amount) external view returns (uint);

}
