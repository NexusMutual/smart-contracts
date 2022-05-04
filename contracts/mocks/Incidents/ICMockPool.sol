// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IPool.sol";

contract ICMockPool {
  using SafeERC20 for IERC20;

  IPool.Asset[] public coverAssets;

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor () {
    // First asset is ETH
    coverAssets.push(IPool.Asset(ETH, 18));
  }

  function sendPayout (
    uint assetIndex,
    address payable payoutAddress,
    uint amount
  ) external {
    IPool.Asset memory asset = coverAssets[assetIndex];

    if (asset.assetAddress == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool transferSucceeded, /* data */) = payoutAddress.call{value: amount}("");
      require(transferSucceeded, "Pool: ETH transfer failed");
    } else {
      IERC20(asset.assetAddress).safeTransfer(payoutAddress, amount);
    }
  }

  function addAsset(address assetAddress, uint8 decimals) external {
    coverAssets.push(IPool.Asset(assetAddress, decimals));
  }

  fallback() external payable {}

  receive() external payable {}

}
