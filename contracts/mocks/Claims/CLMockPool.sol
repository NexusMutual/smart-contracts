// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

contract CLMockPool {
  address[] public assets;

  function sendClaimPayout(
    uint payoutAsset,
    address payable payoutAddress,
    uint amount
  ) public returns (bool) {
    return true;
  }

  function addAsset(address asset) external {
    assets.push(asset);
  }

  function getTokenPrice(uint assetId) public view returns (uint tokenPrice) {
    if (assetId == 0) {
      tokenPrice = 38200000000000000; // 1 NXM ~ 0.0382 ETH
    }
    tokenPrice = 3820000000000000000; // 1 NXM ~ 3.82 DAI
  }
}
