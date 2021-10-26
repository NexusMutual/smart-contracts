// SPDX-License-Identifier: GPL-3.0-only
import "../../interfaces/IPool.sol";

pragma solidity ^0.5.17;

contract ICMockPool {
  IPool.Asset[] public assets;

  function sendClaimPayout(
    address asset,
    address payable payoutAddress,
    uint amount
  ) public returns (bool) {
    return true;
  }

  function addAsset(address assetAddress, uint8 decimals) external {
    assets.push(IPool.Asset(assetAddress, decimals, false));
  }
}
