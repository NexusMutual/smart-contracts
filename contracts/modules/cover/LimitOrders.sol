// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-v4/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/access/Ownable.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ILimitOrders.sol";
import "../../interfaces/IPool.sol";

contract LimitOrders is ILimitOrders, MasterAwareV2, EIP712 {
  using ECDSA for bytes32;
  using SafeERC20 for IERC20;

  /* ========== STATE VARIABLES ========== */
  mapping(bytes32 => OrderStatus) public orderStatus;

  /* ========== IMMUTABLES ========== */
  INXMToken public immutable nxmToken;
  IWeth public immutable weth;

  /* ========== CONSTANTS ========== */
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint private constant ETH_ASSET_ID = 0;
  uint private constant NXM_ASSET_ID = type(uint8).max;

  bytes32 private constant EXECUTE_ORDER_TYPEHASH = keccak256(
    abi.encodePacked(
      "ExecuteOrder(",
      "uint24 productId,",
      "uint96 amount,",
      "uint32 period,",
      "uint8 paymentAsset,",
      "uint8 coverAsset,",
      "address owner,",
      "string ipfsData,",
      "ExecutionDetails executionDetails)",
      "ExecutionDetails(uint256 notBefore,uint256 deadline,uint256 maxPremiumInAsset)"
    )
  );

  /* ========== CONSTRUCTOR ========== */
  constructor(address _nxmTokenAddress, address _wethAddress) EIP712("NexusMutualCoverOrder", "1") {
    nxmToken = INXMToken(_nxmTokenAddress);
    weth = IWeth(_wethAddress);
  }

  /// @notice Executes the order to buy cover on behalf of the creator of limit order
  /// @notice Function only allows users to pay with coverAsset or NXM, this is being checked in the Cover contract
  /// @param params Cover buy parameters
  /// @param poolAllocationRequests Pool allocations for the cover
  /// @param executionDetails Start and end date when the order can be executed and max premium in asset
  /// @param signature The signature of the order
  function executeOrder(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    ExecutionDetails calldata executionDetails,
    bytes calldata signature
  ) external payable onlyMember returns (uint coverId) {

    if (block.timestamp > executionDetails.deadline) {
      revert OrderExpired();
    }

    if (block.timestamp < executionDetails.notBefore) {
      revert OrderCannotBeExecutedYet();
    }

    if (params.maxPremiumInAsset > executionDetails.maxPremiumInAsset) {
      revert OrderPriceNotMet();
    }

    if (params.owner == address(0) || params.owner == address(this)) {
      revert InvalidOwnerAddress();
    }

    // Extracts signer address and digest from signature
    (bytes32 id, address buyer) = _extractIdAndSigner(params, executionDetails, signature);

    // Ensure the order has not already been executed
    if (orderStatus[id] == OrderStatus.Executed) {
      revert OrderAlreadyExecuted();
    }

    // Ensure the order is not cancelled
    if (orderStatus[id] == OrderStatus.Cancelled) {
      revert OrderAlreadyCancelled();
    }

    // Mark the order as executed
    orderStatus[id] = OrderStatus.Executed;

    // ETH payment
    if (params.paymentAsset == ETH_ASSET_ID) {
      coverId = _buyCoverEthPayment(buyer, params, poolAllocationRequests);
    } else {
      // ERC20 payment
      coverId = cover().buyCoverFor(buyer, params, poolAllocationRequests);
    }

    // Emit event
    emit OrderExecuted(params.owner, coverId, id);

  }

  function cancelOrder(
    BuyCoverParams calldata params,
    ExecutionDetails calldata expirationDetails,
    bytes calldata signature
  ) external {

    (bytes32 id, address buyer)= _extractIdAndSigner(params, expirationDetails, signature);

    if (orderStatus[id] == OrderStatus.Executed) {
      revert OrderAlreadyExecuted();
    }

    if (buyer != msg.sender) {
      revert NotOrderOwner();
    }

    orderStatus[id] = OrderStatus.Cancelled;
    emit OrderCancelled(id);
  }

  /// @notice Handles verification of the order signature
  /// @param params Cover buy parameters
  /// @param executionDetails Start and end date when the order can be executed and max premium in asset
  /// @param signature The signature of the order
  function _extractIdAndSigner(
    BuyCoverParams calldata params,
    ExecutionDetails calldata executionDetails,
    bytes calldata signature
  ) internal view returns (bytes32 digest, address signer) {

    // Hash the ExecutionDetails struct
    bytes32 executionDetailsHash = keccak256(
      abi.encode(
        keccak256("ExecutionDetails(uint256 notBefore,uint256 deadline,uint256 maxPremiumInAsset)"),
        executionDetails.notBefore,
        executionDetails.deadline,
        executionDetails.maxPremiumInAsset
      )
    );

    // Hash the structured data
    bytes32 structHash = keccak256(
      abi.encode(
        EXECUTE_ORDER_TYPEHASH,
        params.productId,
        params.amount,
        params.period,
        params.paymentAsset,
        params.coverAsset,
        params.owner,
        keccak256(abi.encodePacked(params.ipfsData)),
        executionDetailsHash
      )
    );

    // Generate the digest (domain separator + struct hash)
    digest = _hashTypedDataV4(structHash);

    // Recover the signer from the digest and the signature
    signer = ECDSA.recover(digest, signature);

    return (digest, signer);
  }

  /// @notice Handles ETH/WETH payments for buying cover.
  /// @dev Transfers WETH tokens from the order creator to the contract, then unwraps it,  then buys cover on behalf of the creator.
  //       Calculates ETH refunds if any and sends back to param.owner.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _buyCoverEthPayment(
    address buyer,
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) internal returns (uint coverId) {

    uint ethBalanceBefore = address(this).balance;

    weth.transferFrom(buyer, address(this), params.maxPremiumInAsset);
    weth.withdraw(params.maxPremiumInAsset);

    coverId = cover().buyCoverFor{value: params.maxPremiumInAsset}(address(this), params, poolAllocationRequests);

    uint ethBalanceAfter = address(this).balance;

    // transfer any ETH refund back to signer
    if (ethBalanceAfter > ethBalanceBefore) {
      uint ethRefund = ethBalanceAfter - ethBalanceBefore;
      weth.deposit{ value: ethRefund }();

      bool sent = weth.transferFrom(address(this), buyer, ethRefund);

      if (!sent) {
        revert TransferFailed(buyer, ethRefund, ETH);
      }

      return coverId;
    }
  }

  /* ========== DEPENDENCIES ========== */

  /// @return The Pool's instance
  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  /// @return The Cover's instance
  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
  }

  receive() external payable {}
}
