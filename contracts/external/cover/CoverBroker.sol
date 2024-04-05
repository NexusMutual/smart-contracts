// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/access/Ownable.sol";

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverBroker.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/INXMToken.sol";


/// @title Cover Broker Contract
/// @notice Enables non-members of the mutual to purchase cover policies.
/// Supports ETH and ERC20 asset payments which are supported by the pool.
/// For NXM payments by members, please call Cover.buyCover instead.
/// @dev See supported ERC20 payment methods via pool.getAssets.
contract CoverBroker is ICoverBroker, Ownable {
  using SafeERC20 for IERC20;

  // Immutables
  ICover public immutable cover;
  IMemberRoles public immutable memberRoles;
  INXMToken public immutable nxmToken;
  INXMMaster public immutable master;

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint private constant ETH_ASSET_ID = 0;
  uint private constant NXM_ASSET_ID = type(uint8).max;

  constructor(address _cover, address _memberRoles, address _nxmToken, address _master) {
    cover = ICover(_cover);
    memberRoles = IMemberRoles(_memberRoles);
    nxmToken = INXMToken(_nxmToken);
    master = INXMMaster(_master);
  }

  /// @notice Buys cover on behalf of the caller. Supports ETH and ERC20 asset payments which are supported by the pool.
  /// @dev For ERC20 payments, ensure the Cover contract is approved to spend the tokens first (maxApproveCoverContract).
  /// See supported ERC20 payment methods via pool.getAssets.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) external payable returns (uint coverId) {

    if (params.owner == address(0) || params.owner == address(this)) {
      revert InvalidOwnerAddress();
    }

    if (params.paymentAsset == NXM_ASSET_ID) {
      revert InvalidPaymentAsset();
    }

    // ETH payment
    if (params.paymentAsset == ETH_ASSET_ID) {
      return _buyCoverEthPayment(params, poolAllocationRequests);
    }

    // msg.value must be 0 if not an ETH payment
    if (msg.value > 0) {
      revert InvalidPayment();
    }

    // ERC20 payment
    return _buyCoverErc20Payment(params, poolAllocationRequests);
  }

  /// @notice Handles ETH payments for buying cover.
  /// @dev Calculates ETH refunds if applicable and sends back to msg.sender.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _buyCoverEthPayment(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) internal returns (uint coverId) {

    uint ethBalanceBefore = address(this).balance - msg.value;
    coverId = cover.buyCover{value: msg.value}(params, poolAllocationRequests);
    uint ethBalanceAfter = address(this).balance;

    // transfer any ETH refund back to msg.sender
    if (ethBalanceAfter > ethBalanceBefore) {
      uint ethRefund = ethBalanceAfter - ethBalanceBefore;
      (bool sent, ) = payable(msg.sender).call{value: ethRefund}("");
      if (!sent) {
        revert TransferFailed(msg.sender, ethRefund, ETH);
      }
    }
  }
  
  /// @notice Handles ERC20 payments for buying cover.
  /// @dev Transfers ERC20 tokens from the caller to the contract, then buys cover on behalf of the caller.
  /// Calculates ERC20 refunds if any and sends back to msg.sender.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _buyCoverErc20Payment(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) internal returns (uint coverId) {
    
    address paymentAsset = pool.getAsset(params.paymentAsset).assetAddress;
    IERC20 erc20 = IERC20(paymentAsset);

    uint erc20BalanceBefore = erc20.balanceOf(address(this));

    erc20.safeTransferFrom(msg.sender, address(this), params.maxPremiumInAsset);
    coverId = cover.buyCover(params, poolAllocationRequests);

    uint erc20BalanceAfter = erc20.balanceOf(address(this));

    // send any ERC20 refund back to msg.sender
    if (erc20BalanceAfter > erc20BalanceBefore) {
      uint erc20Refund = erc20BalanceAfter - erc20BalanceBefore;
      erc20.safeTransfer(msg.sender, erc20Refund);
    }
  }

  receive() external payable {}
}
