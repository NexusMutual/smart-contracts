// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IPool.sol";

contract CLMockPool {
  using SafeERC20 for IERC20;

  IPool.Asset[] public assets;

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor () public {
    // First asset is ETH
    assets.push(IPool.Asset(ETH, 18, false));
  }

  function addAsset(address assetAddress, uint8 decimals) external {
    assets.push(IPool.Asset(assetAddress, decimals, false));
  }

  function getTokenPrice(uint assetId) public view returns (uint tokenPrice) {
    if (assetId == 0) {
      tokenPrice = 38200000000000000; // 1 NXM ~ 0.0382 ETH
    }
    tokenPrice = 3820000000000000000; // 1 NXM ~ 3.82 DAI
  }

  function sendPayout (
    uint assetIndex,
    address payable payoutAddress,
    uint amount
  ) external {
    bool ok;
    IPool.Asset memory asset = assets[assetIndex];

    if (asset.assetAddress == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool transferSucceeded, /* data */) = payoutAddress.call{value: amount}("");
      require(transferSucceeded, "Pool: ETH transfer failed");
    } else {
      IERC20(asset.assetAddress).safeTransfer(payoutAddress, amount);
    }
  }

  fallback() external payable {}
}
