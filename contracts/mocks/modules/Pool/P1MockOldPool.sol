// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

contract P1MockOldPool {
  struct Asset {
    address assetAddress;
    bool isCoverAsset;
    bool isAbandoned;
  }

  Asset[] public assets;
  address public priceFeedOracleAddress;

  constructor() {}

  function priceFeedOracle() external view returns (address) {
    return priceFeedOracleAddress;
  }

  function getAssets() external view returns (Asset[] memory) {
    return assets ;
  }

  function setPriceFeedOracle(address _priceFeedOracle) external {
    priceFeedOracleAddress = _priceFeedOracle;
  }

  function addAsset(address assetAddress, bool isCoverAsset) external {
    assets.push(Asset({
      assetAddress: assetAddress,
      isCoverAsset: isCoverAsset,
      isAbandoned: false
    }));
  }
}
