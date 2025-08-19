// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {PoolGeneric} from "../../generic/PoolGeneric.sol";
import {Asset} from "../../../interfaces/IPool.sol";

contract P1MockOldPool is PoolGeneric {
  Asset[] public assets;
  address public priceFeedOracleAddress;

  constructor() {}

  function priceFeedOracle() external view returns (address) {
    return priceFeedOracleAddress;
  }

  function getAssets() external view override returns (Asset[] memory) {
    return assets;
  }

  function setPriceFeedOracle(address _priceFeedOracle) external {
    priceFeedOracleAddress = _priceFeedOracle;
  }

  function addAsset(address assetAddress, bool isCoverAsset) external {
    assets.push(Asset({assetAddress: assetAddress, isCoverAsset: isCoverAsset, isAbandoned: false}));
  }
}
