// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/access/Ownable.sol";

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverBroker.sol";
import "../../interfaces/IMemberRoles.sol";

/// @dev Allows cover distribution by buying cover in behalf of the caller
contract CoverBroker is ICoverBroker, Ownable {

  // Immutables
  ICover cover;
  IMemberRoles memberRoles;

  // Constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor(address _cover, address _memberRoles) {
    cover = ICover(_cover);
    memberRoles = IMemberRoles(_memberRoles);
  }

  /// @dev buys cover in behalf of the caller
  function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) external payable nonReentrant returns (uint coverId) {
    uint ethBalanceBefore = address(this).balance;

    // set the cover owner to the caller
    params.owner = msg.sender;

    // call cover.buyCover with msg.value and params
    coverId = cover.buyCover{value: msg.value}(params, poolAllocationRequests);

    if (address(this).balance > ethBalanceBefore) {
      // send back any ETH refund to user
      unchecked {
        uint ethRefund = address(this).balance - ethBalanceBefore;
        (bool sent, ) = payable(msg.sender).call{value: ethRefund}("");
        if (!sent) {
          revert TransferFailed(msg.sender, ethRefund, ETH);
        }
      }
    }
  }

  /// @dev switches the membership to the given address
  function switchMembership(address newAddress) external onlyOwner {
    memberRoles.switchMembership(newAddress);
  }

  /// @dev transfers available funds to owner
  function transferFunds(address assetAddress) external onlyOwner {
    if (assetAddress == ETH) {
      uint ethBalance = address(this).balance;
      if (ethBalance == 0) {
        revert ZeroBalance(ETH);
      }

      (bool sent, ) = payable(owner).call{value: ethBalance}("");
      if (!sent) {
        revert TransferFailed(owner, ethBalance, ETH); 
      }

      return;
    }

    IERC20 asset = IERC20(assetAddress);
    uint erc20Balance = asset.balanceOf(address(this));
    if (erc20Balance == 0) {
      revert ZeroBalance(assetAddress);
    }

    asset.transfer(owner, erc20Balance);
  }
}
