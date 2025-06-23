// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IPool.sol";

// TODO: implement the IPool interface
contract PoolGeneric /* is IPool */ {

  address public swapOperator;

  function getAsset(uint) external virtual view returns (Asset memory) {
    revert("Unsupported");
  }

  function getAssets() external virtual view returns (Asset[] memory) {
    revert("Unsupported");
  }

  function transferAssetToSwapOperator(address, uint) external virtual pure {
    revert("Unsupported");
  }

  function setSwapDetailsLastSwapTime(address, uint32) external virtual pure {
    revert("Unsupported");
  }

  function sendPayout(uint, address payable, uint, uint) external virtual {
    revert("Unsupported");
  }

  function returnDeposit(address payable, uint) external virtual {
    revert("Unsupported");
  }

  function sendEth(address, uint) external virtual {
    revert("Unsupported");
  }

  function upgradeCapitalPool(address payable) external virtual pure {
    revert("Unsupported");
  }

  function getPoolValueInEth() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function calculateMCRRatio(uint, uint) external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getInternalTokenPriceInAsset(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getInternalTokenPriceInAssetAndUpdateTwap(uint) external virtual returns (uint) {
    revert("Unsupported");
  }

  function getTokenPrice() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getMCRRatio() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function setSwapAssetAmount(address, uint) external virtual pure {
    revert("Unsupported");
  }

  fallback() external virtual payable {
    revert("Unsupported");
  }

  receive() external virtual payable { }
}
