// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "../interfaces/ICover.sol";

interface ICoverBroker {

  /* ==== FUNCTIONS ==== */

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) external payable returns (uint coverId);

  function maxApproveCoverContract(IERC20 token) external;

  function switchMembership(address newAddress) external;

  function rescueFunds(address assetAddress) external;

  /* ==== ERRORS ==== */

  error TransferFailed(address to, uint value, address token);
  error ZeroBalance(address token);
  error InvalidOwnerAddress();
  error InvalidPaymentAsset();
  error InvalidPayment();
}
