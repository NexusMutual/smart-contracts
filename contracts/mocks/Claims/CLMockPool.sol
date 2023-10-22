// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IPool.sol";

// TODO: needs to implement IPool
contract CLMockPool {
  using SafeERC20 for IERC20;

  Asset[] public assets;

  address constant public ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor () {
    // First asset is ETH
    assets.push(Asset(ETH, true, false));
  }

  function addAsset(Asset memory asset) external {
    assets.push(asset);
  }

  function getAsset(uint assetId) external view returns (Asset memory) {
    require(assetId < assets.length, "Pool: Invalid asset id");
    return assets[assetId];
  }

  function getInternalTokenPriceInAsset(uint assetId) public pure returns (uint tokenPrice) {
    return assetId == 0
      ? 0.0382 ether // 1 NXM ~ 0.0382 ETH
      : 3.82 ether; // 1 NXM ~ 3.82 DAI
  }

  function sendPayout (
    uint assetIndex,
    address payable payoutAddress,
    uint amount,
    uint ethDepositAmount
  ) external {

    Asset memory asset = assets[assetIndex];

    if (asset.assetAddress == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool transferSucceeded, /* data */) = payoutAddress.call{value: amount}("");
      require(transferSucceeded, "Pool: ETH transfer failed");
    } else {
      IERC20(asset.assetAddress).safeTransfer(payoutAddress, amount);
    }

    (bool ok, /* data */) = payoutAddress.call{value: ethDepositAmount}("");
    require(ok, "Pool: ETH transfer failed");
  }

  fallback() external payable virtual {}

  receive() external payable virtual {}

}
