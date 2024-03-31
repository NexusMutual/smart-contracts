// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../interfaces/ICover.sol";

interface ICoverBroker {
  /* ==== FUNCTIONS ==== */

  function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) external payable returns (uint coverId);

  function switchMembership(address newAddress) external;

  function transferFunds(address assetAddress) external;

  /* ==== ERRORS ==== */

  error TransferFailed(address to, uint value, address token);
  error ZeroBalance(address token);
}
