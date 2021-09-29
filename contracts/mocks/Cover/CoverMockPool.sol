// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;


contract CoverMockPool {

  mapping (uint => uint) prices;
  address[] public assets;

  constructor() public {
  }

  function getTokenPrice(uint assetId) public view returns (uint) {
    return prices[assetId];
  }

  function setTokenPrice(uint assetId, uint price) public {
    prices[assetId] = price;
  }

  function setAssets(address[] memory _assets) public {
    for (uint i = 0; i < _assets.length; i++) {
      assets.push(_assets[i]);
    }
  }
}
