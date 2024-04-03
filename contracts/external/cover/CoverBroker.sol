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
/// Supports ETH, NXM, and ERC20 asset payments which are supported by the pool.
/// @dev See supported ERC20 payment methods via pool.getAssets.
contract CoverBroker is ICoverBroker, Ownable {
  using SafeERC20 for IERC20;

  // Immutables
  ICover public immutable cover;
  IMemberRoles public immutable memberRoles;
  IPool public immutable pool;
  INXMToken public immutable nxmToken;
  address public immutable tokenController;

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint private constant ETH_ASSET_ID = 0;
  uint private constant NXM_ASSET_ID = type(uint8).max;

  constructor(address _cover, address _memberRoles, address _pool, address _nxmToken, address _tokenController) {
    cover = ICover(_cover);
    memberRoles = IMemberRoles(_memberRoles);
    pool = IPool(_pool);
    nxmToken = INXMToken(_nxmToken);

    tokenController = _tokenController;
    nxmToken.approve(tokenController, type(uint256).max);
  }

  /// @notice Buys cover on behalf of the caller. Supports ETH, NXM and ERC20 asset payments which are supported by the pool.
  /// @dev For NXM and ERC20 payments, ensure the Cover contract is approved to spend the tokens first (maxApproveCoverContract).
  /// See supported ERC20 payment methods via pool.getAssets.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) external payable returns (uint coverId) {

    // ETH payment
    if (params.paymentAsset == ETH_ASSET_ID) {
      return _handleEthPayment(params, poolAllocationRequests);
    }

    // msg.value must be 0 if not an ETH payment
    if (msg.value > 0) {
      revert InvalidPayment();
    }

    // NXM payment
    if (params.paymentAsset == NXM_ASSET_ID) {
      return _handleNxmPayment(params, poolAllocationRequests);
    }

    // ERC20 payment
    return _handleErc20Payment(params, poolAllocationRequests);
  }

  /// @notice Allows the Cover contract to spend the maximum possible amount of a specified ERC20 token on behalf of the CoverBroker.
  /// @param erc20 The ERC20 token for which to approve spending.
  function maxApproveCoverContract(IERC20 erc20) external onlyOwner {
    erc20.safeApprove(address(cover), type(uint256).max);
  }

  /// @notice Switches CoverBroker's membership to a new address.
  /// @dev MemberRoles contract needs to be approved to transfer NXM tokens to new membership address.
  /// @param newAddress The address to which the membership will be switched.
  function switchMembership(address newAddress) external onlyOwner {
    nxmToken.approve(address(memberRoles), type(uint256).max);
    memberRoles.switchMembership(newAddress);
  }

  /// @notice Transfers all available funds of a specified asset (ETH or ERC20) to the contract owner.
  /// @param assetAddress The address of the asset to be transferred.
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

  /// @notice Handles ETH payments for buying cover.
  /// @dev Calculates ETH refunds if applicable and sends back to msg.sender.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _handleEthPayment(
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
  
  /// @notice Handles NXM payments for buying cover.
  /// @dev Transfers NXM from the caller to the contract, then buys cover on behalf of the caller.
  /// Calculates NXM refunds if any and sends back to msg.sender.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _handleNxmPayment(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) internal returns (uint coverId) {

    uint nxmBalanceBefore = nxmToken.balanceOf(address(this));

    nxmToken.transferFrom(msg.sender, address(this), params.maxPremiumInAsset);
    coverId = cover.buyCover(params, poolAllocationRequests);

    uint nxmBalanceAfter = nxmToken.balanceOf(address(this));

    // transfer any NXM refund back to msg.sender
    if (nxmBalanceAfter > nxmBalanceBefore) {
      uint nxmRefund = nxmBalanceAfter - nxmBalanceBefore;
      nxmToken.transfer(msg.sender, nxmRefund);
    }
  }

  /// @notice Handles ERC20 payments for buying cover.
  /// @dev Transfers ERC20 tokens from the caller to the contract, then buys cover on behalf of the caller.
  /// Calculates ERC20 refunds if any and sends back to msg.sender.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _handleErc20Payment(
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
