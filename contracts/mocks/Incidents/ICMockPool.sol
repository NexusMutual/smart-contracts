// SPDX-License-Identifier: GPL-3.0-only
import "../../interfaces/IPool.sol";

pragma solidity ^0.5.17;

contract ICMockPool {
  IPool.Asset[] public assets;

  function sendPayout(
    address asset,
    address payable payoutAddress,
    uint amount
  ) public {}

  function addAsset(address assetAddress, uint8 decimals) external {
    assets.push(IPool.Asset(assetAddress, decimals, false));
  }
}
