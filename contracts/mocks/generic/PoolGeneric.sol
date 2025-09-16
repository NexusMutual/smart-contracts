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

  function getAsset(uint /* assetId */) external virtual view returns (Asset memory) {
    revert("getAsset unsupported");
  }

  function getAssets() external virtual view returns (Asset[] memory) {
    revert("getAssets unsupported");
  }

  function transferAssetToSafe(address /* assetAddress */, address /* safeAddress */, uint /* amount */) external virtual {
    revert("transferAssetToSafe unsupported");
  }

  function setAssetDetails(uint /* assetId */, bool /* isCoverAsset */, bool /* isAbandoned */) external virtual {
    revert("setAssetDetails unsupported");
  }

  function transferAssetToSwapOperator(address /* assetAddress */, uint /* amount */) external virtual {
    revert("transferAssetToSwapOperator unsupported");
  }

  function sendPayout(uint /* assetIndex */, address payable /* payoutAddress */, uint /* amount */, uint /* depositInETH */) external virtual {
    revert("sendPayout unsupported");
  }

  function sendEth(address payable /* payoutAddress */, uint /* amount */) external virtual {
    revert("sendEth unsupported");
  }

  function getPoolValueInEth() external virtual view returns (uint) {
    revert("getPoolValueInEth unsupported");
  }

  function getInternalTokenPriceInAsset(uint /* assetId */) external virtual view returns (uint /* tokenPrice */) {
    revert("getInternalTokenPriceInAsset unsupported");
  }

  function getInternalTokenPriceInAssetAndUpdateTwap(uint /* assetId */) external virtual returns (uint /* tokenPrice */) {
    revert("getInternalTokenPriceInAssetAndUpdateTwap unsupported");
  }

  function getTokenPrice() external virtual view returns (uint /* tokenPrice */) {
    revert("getTokenPrice unsupported");
  }

  function getMCRRatio() external virtual view returns (uint) {
    revert("getMCRRatio unsupported");
  }

  function getMCR() external virtual view returns (uint) {
    revert("getMCR unsupported");
  }

  function clearSwapAssetAmount(address /* assetAddress */) external virtual {
    revert("clearSwapAssetAmount unsupported");
  }

  function getAssetForEth(address /* assetAddress */, uint /* amount */) external virtual view returns (uint) {
    revert("getAssetForEth unsupported");
  }

  function getEthForAsset(address /* assetAddress */, uint /* amount */) external virtual view returns (uint) {
    revert("getEthForAsset unsupported");
  }

  function updateMCR() external virtual {
    revert("updateMCR unsupported");
  }

  function updateMCRInternal(bool /* forceUpdate */) external virtual {
    revert("updateMCRInternal unsupported");
  }

  // Legacy functions not in IPool interface but kept for compatibility
  function setSwapDetailsLastSwapTime(address /* assetAddress */, uint32 /* lastSwapTime */) external virtual {
    revert("setSwapDetailsLastSwapTime unsupported");
  }

  function upgradeCapitalPool(address payable /* newPoolAddress */) external virtual {
    revert("upgradeCapitalPool unsupported");
  }

  function calculateMCRRatio(uint /* totalAssetValue */, uint /* mcrValue */) external virtual pure returns (uint) {
    revert("calculateMCRRatio unsupported");
  }

  function setSwapAssetAmount(address /* assetAddress */, uint /* amount */) external virtual {
    revert("setSwapAssetAmount unsupported");
  }

  function migrate(address /* previousPool */, address /* previousMCR */) external virtual {
    revert("migrate unsupported");
  }

  fallback() external virtual payable {
    revert("fallback unsupported");
  }

  receive() external virtual payable { }
}
