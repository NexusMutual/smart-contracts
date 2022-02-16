// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/IPool.sol";

contract CoverMockPool {

  mapping (uint => uint) prices;
  IPool.Asset[] public assets;

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor() {
    // First asset is ETH
    assets.push(IPool.Asset(ETH, 18, false));
  }

  function getTokenPrice(uint assetId) public view returns (uint) {
    return prices[assetId];
  }

  function setTokenPrice(uint assetId, uint price) public {
    prices[assetId] = price;
  }

  function setAssets(address[] memory _assets, uint8[] memory _decimals) public {
    for (uint i = 0; i < _assets.length; i++) {
      assets.push(IPool.Asset(_assets[i], _decimals[i], false));
    }
  }

  fallback() external payable {}

  receive() external payable {}

}
