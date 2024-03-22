// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../external/cow/GPv2Order.sol";

interface ISwapOperator {
  function orderInProgress() external returns (bool);

  function requestAsset(address asset, uint amount) external;

  function transferRequestedAsset(address requestedAsset, uint requestedAmount) external;

  // Events
  event OrderPlaced(GPv2Order.Data order);
  event OrderClosed(GPv2Order.Data order, uint filledAmount);
  event Swapped(address indexed fromAsset, address indexed toAsset, uint amountIn, uint amountOut);
  event TransferredToSafe(address asset, uint amount);
}
