// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IPool.sol";

contract PoolGeneric is IPool {

  function addAsset(
    address /* assetAddress */,
    bool /* isCoverAsset */,
    Aggregator /* aggregator */,
    AggregatorType /* aggregatorType */
  ) external pure {
    revert("Unsupported");
  }

  function getAssetForEth(
    address /* assetAddress */,
    uint /* amount */
  ) external view virtual returns (uint) {
    revert("Unsupported");
  }

  function getEthForAsset(
    address /* assetAddress */,
    uint /* amount */
  ) external view virtual returns (uint) {
    revert("Unsupported");
  }

  function getMCR() external pure returns (uint) {
    revert("Unsupported");
  }

  function setAssetDetails(
    uint /* assetId */,
    bool /* isCoverAsset */,
    bool /* isAbandoned */
  ) external pure {
    revert("Unsupported");
  }

  function updateMCR() external pure {
    revert("Unsupported");
  }

  function updateMCRInternal(bool /* forceUpdate */) external pure {
    revert("Unsupported");
  }

  function getAsset(uint /* assetId */) external virtual view returns (Asset memory) {
    revert("Unsupported");
  }

  function getAssets() external virtual view returns (Asset[] memory) {
    revert("Unsupported");
  }

  function transferAssetToSafe(address /* assetAddress */, address /* safeAddress */, uint /* amount */) external virtual {
    revert("Unsupported");
  }

  function transferAssetToSwapOperator(address /* assetAddress */, uint /* amount */) external virtual {
    revert("Unsupported");
  }

  function clearSwapAssetAmount(address /* assetAddress */) external virtual {
    revert("Unsupported");
  }

  function setSwapDetailsLastSwapTime(address, uint32) external virtual pure {
    revert("Unsupported");
  }

  function sendPayout(uint, address payable, uint, uint) external virtual {
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
