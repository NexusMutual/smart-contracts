// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

contract CLMockPool {
  address[] public assets;

  function sendClaimPayout(
    address asset,
    address payable payoutAddress,
    uint amount
  ) public returns (bool) {
    return true;
  }

  function addAsset(address asset) external {
    assets.push(asset);
  }
}
