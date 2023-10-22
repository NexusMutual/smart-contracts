// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IPool.sol";

// TODO: needs to implement ICover
contract CoverMockPool {

  mapping (uint => uint) internal prices;
  Asset[] public assets;

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor() {
    // First asset is ETH
    assets.push(Asset(ETH, true, false));
  }

  function getInternalTokenPriceInAsset(uint assetId) public view returns (uint) {
    return prices[assetId];
  }

  function setTokenPrice(uint assetId, uint price) public {
    prices[assetId] = price;
  }

  function setAssets(Asset[] memory _assets) public {
    for (uint i = 0; i < _assets.length; i++) {
      assets.push(_assets[i]);
    }
  }

  function setIsCoverAsset(uint assetId, bool isCoverAsset) public {
    assets[assetId].isCoverAsset = isCoverAsset;
  }

  function setIsAbandoned(uint assetId, bool isAbandoned) public {
    assets[assetId].isAbandoned = isAbandoned;
  }

  function getAsset(uint assetId) external view returns (Asset memory) {
    require(assetId < assets.length, "Pool: Invalid asset id");
    return assets[assetId];
  }

  function getAssets() external view returns (Asset[] memory) {
    return assets;
  }

  fallback() external payable {}

  receive() external payable {}

}
