// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "./IMemberRoles.sol";
import "./INXMMaster.sol";
import "./INXMToken.sol";
import "./ICover.sol";
import "./IWeth.sol";
import "./ICover.sol";

struct ExecutionDetails {
  uint256 notBefore;
  uint256 deadline;
  uint256 maxPremiumInAsset;
}

interface ICoverOrder {

  enum OrderStatus {
    Created,
    Executed,
    Cancelled
  }

  /* ==== IMMUTABLES ==== */

  function controller() external view returns (address);

  function master() external view returns (INXMMaster);

  function cover() external view returns (ICover);

  function memberRoles() external view returns (IMemberRoles);

  function nxmToken() external view returns (INXMToken);

  function weth() external view returns (IWeth);

  /* ==== FUNCTIONS ==== */

  function executeOrder(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    ExecutionDetails calldata executionDetails,
    bytes calldata signature
  ) external payable returns (uint coverId);

  function maxApproveCoverContract(IERC20 token) external;

  function switchMembership(address newAddress) external;

  function rescueFunds(address assetAddress) external;

  /* ==== EVENTS ==== */

  event OrderExecuted(address owner, uint coverId, bytes32 id);
  event OrderCancelled(bytes32 id);

  /* ==== ERRORS ==== */

  error OnlyController();
  error OrderAlreadyExecuted();
  error OrderAlreadyCancelled();
  error OrderExpired();
  error OrderCannotBeExecutedYet();
  error OrderPriceNotMet();
  error NotOrderOwner();
  error NotAMember();
  error InvalidSignature();
  error InvalidOwnerAddress();
  error InvalidPaymentAsset();
  error TransferFailed(address to, uint value, address token);
  error ZeroBalance(address token);
}
