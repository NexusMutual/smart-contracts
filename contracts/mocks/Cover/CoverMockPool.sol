// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;


contract CoverMockPool {

  mapping (address => uint) prices;
  address[] public assets;

  constructor() public {
  }

  function getTokenPrice(address asset) public view returns (uint) {
    return prices[asset];
  }

  function setTokenPrice(address asset, uint price) public {
    prices[asset] = price;
  }

  function setAssets(address[] memory _assets) public {
    for (uint i = 0; i < _assets.length; i++) {
      assets.push(_assets[i]);
    }
  }
}
