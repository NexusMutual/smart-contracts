// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

contract PoolMockForCowSwap {
  function getAssetSwapDetails(address assetAddress)
    external
    view
    override
    returns (
      uint104 min,
      uint104 max,
      uint32 lastAssetSwapTime,
      uint16 maxSlippageRatio
    )
  {
    SwapDetails memory details = swapDetails[assetAddress];

    return (details.minAmount, details.maxAmount, details.lastSwapTime, details.maxSlippageRatio);
  }
}
