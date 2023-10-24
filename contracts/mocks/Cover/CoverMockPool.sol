// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../common/PoolMock.sol";

contract CoverMockPool is PoolMock {

  mapping (uint => uint) internal prices;

  function getInternalTokenPriceInAsset(uint assetId) public override view returns (uint) {
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

}
