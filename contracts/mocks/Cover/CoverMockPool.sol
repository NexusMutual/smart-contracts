// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/IPool.sol";

contract CoverMockPool {

  mapping (uint => uint) prices;
  IPool.Asset[] public payoutAssets;

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor() {
    // First asset is ETH
    payoutAssets.push(IPool.Asset(ETH, 18));
  }

  function getTokenPrice(uint assetId) public view returns (uint) {
    return prices[assetId];
  }

  function setTokenPrice(uint assetId, uint price) public {
    prices[assetId] = price;
  }

  function setAssets(address[] memory _assets, uint8[] memory _decimals) public {
    for (uint i = 0; i < _assets.length; i++) {
      payoutAssets.push(IPool.Asset(_assets[i], _decimals[i]));
    }
  }

  fallback() external payable {}

  receive() external payable {}

}
