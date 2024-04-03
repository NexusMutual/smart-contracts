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


/// @dev Allows cover distribution by buying cover in behalf of the caller
contract CoverBroker is ICoverBroker, Ownable {
  using SafeERC20 for IERC20;

  // Immutables
  ICover public immutable cover;
  IMemberRoles public immutable memberRoles;
  IPool public immutable pool;
  INXMToken public immutable nxmToken;

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint private constant ETH_ASSET_ID = 0;
  uint private constant NXM_ASSET_ID = type(uint8).max;

  constructor(address _cover, address _memberRoles, address _pool, address _nxmToken) {
    cover = ICover(_cover);
    memberRoles = IMemberRoles(_memberRoles);
    pool = IPool(_pool);
    nxmToken = INXMToken(_nxmToken);
  }

  /// @dev Buys cover in behalf of the caller
  /// @notice for ERC20 payments, the cover contract must be first approved for ERC20 spending using maxApproveCoverContract
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) external payable returns (uint coverId) {

    // ETH payment

    if (params.paymentAsset == ETH_ASSET_ID) {
      uint ethBalanceBefore = address(this).balance - msg.value;
      coverId = cover.buyCover{value: msg.value}(params, poolAllocationRequests);
      uint ethBalanceAfter = address(this).balance;

      // send any ETH refund back to msg.sender
      if (ethBalanceAfter > ethBalanceBefore) {
        uint ethRefund = ethBalanceAfter - ethBalanceBefore;
        (bool sent, ) = payable(msg.sender).call{value: ethRefund}("");
        if (!sent) {
          revert TransferFailed(msg.sender, ethRefund, ETH);
        }
      }

      return coverId;
    }

    if (msg.value > 0) {
      // msg.value must be 0 if not ETH payment
      revert InvalidPayment();
    }

    // NXM payment

    if (params.paymentAsset == NXM_ASSET_ID) {
      uint nxmBalanceBefore = nxmToken.balanceOf(address(this));

      nxmToken.transferFrom(msg.sender, address(this), params.maxPremiumInAsset);
      coverId = cover.buyCover(params, poolAllocationRequests);

      // send any NXM refund back to msg.sender
      uint nxmBalanceAfter = nxmToken.balanceOf(address(this));
      if (nxmBalanceAfter > nxmBalanceBefore) {
        uint erc20Refund = nxmBalanceAfter - nxmBalanceBefore;
        nxmToken.transfer(msg.sender, erc20Refund);
      }
      return coverId;
    }

    // ERC20 payment

    address paymentAsset = pool.getAsset(params.paymentAsset).assetAddress;
    IERC20 erc20 = IERC20(paymentAsset);
    uint erc20BalanceBefore = erc20.balanceOf(address(this));

    erc20.safeTransferFrom(msg.sender, address(this), params.maxPremiumInAsset);
    coverId = cover.buyCover(params, poolAllocationRequests);

    // send any ERC20 refund back to msg.sender
    uint erc20BalanceAfter = erc20.balanceOf(address(this));
    if (erc20BalanceAfter > erc20BalanceBefore) {
      uint erc20Refund = erc20BalanceAfter - erc20BalanceBefore;
      erc20.safeTransfer(msg.sender, erc20Refund);
    }
  }

  /// @dev Approves cover contract to spend max value of the given ERC20 token in behalf of CoverBroker
  function maxApproveCoverContract(IERC20 erc20) external onlyOwner {
    erc20.safeApprove(address(cover), type(uint256).max);
  }

  /// @dev Switches the membership to the given address
  function switchMembership(address newAddress) external onlyOwner {
    nxmToken.approve(address(memberRoles), type(uint256).max);
    memberRoles.switchMembership(newAddress);
  }

  /// @dev Transfers available funds of the specified asset to owner
  function transferFunds(address assetAddress) external onlyOwner {

    if (assetAddress == ETH) {
      uint ethBalance = address(this).balance;
      if (ethBalance == 0) {
        revert ZeroBalance(ETH);
      }

      (bool sent, ) = payable(msg.sender).call{value: ethBalance}("");
      if (!sent) {
        revert TransferFailed(msg.sender, ethBalance, ETH);
      }

      return;
    }

    IERC20 asset = IERC20(assetAddress);
    uint erc20Balance = asset.balanceOf(address(this));
    if (erc20Balance == 0) {
      revert ZeroBalance(assetAddress);
    }

    asset.transfer(msg.sender, erc20Balance);
  }

  receive() external payable {}
}
