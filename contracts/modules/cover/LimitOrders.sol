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
  mapping(bytes32 => OrderDetails) public orderDetails;

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
      "uint256 coverId,",
      "uint24 productId,",
      "uint96 amount,",
      "uint32 period,",
      "uint8 paymentAsset,",
      "uint8 coverAsset,",
      "address owner,",
      "string ipfsData,",
      "uint16 commissionRatio,",
      "address commissionDestination,",
      "ExecutionDetails executionDetails)",
      "ExecutionDetails(uint256 notBefore,uint256 deadline,uint256 maxPremiumInAsset,uint8 maxNumberOfRenewals,uint32 renewWhenLeft)"
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
  /// @return coverId The ID of the purchased cover
  function executeOrder(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    ExecutionDetails calldata executionDetails,
    bytes calldata signature,
    uint256 solverFee
  ) external payable onlyMember returns (uint coverId) {

    if (params.owner == address(0) || params.owner == address(this)) {
      revert InvalidOwnerAddress();
    }

    if (params.maxPremiumInAsset > executionDetails.maxPremiumInAsset + solverFee) {
      revert OrderPriceNotMet();
    }

    bytes32 id = getOrderId(params, executionDetails);
    address buyer = ECDSA.recover(id, signature);
    OrderDetails memory _orderDetails = orderDetails[id];
    bool isNewCover = _orderDetails.coverId == 0;

    if (isNewCover && block.timestamp > executionDetails.deadline) {
      revert OrderExpired();
    }

    if (isNewCover && block.timestamp < executionDetails.notBefore) {
      revert OrderCannotBeExecutedYet();
    }

    // TODO: Fetch latest cover and check if end of the cover is in the renewWhenLeft period

    // Ensure the order has not already been executed
    if (_orderDetails.executionCounter > _orderDetails.maxRenewals) {
      revert OrderAlreadyExecuted();
    }

    // Ensure the order is not cancelled
    if (_orderDetails.isCancelled) {
      revert OrderAlreadyCancelled();
    }


    // ETH payment
    if (params.paymentAsset == ETH_ASSET_ID) {
      coverId = _buyCoverEthPayment(buyer, params, poolAllocationRequests, solverFee);
    } else {
      // ERC20 payment
      coverId = _buyCoverErc20Payment(buyer, params, poolAllocationRequests, solverFee);
    }

    if (isNewCover) {
      _orderDetails.executionCounter = 0;
      _orderDetails.coverId = uint192(coverId);
    }

    _orderDetails.executionCounter++;

    orderDetails[id] = _orderDetails;

    // Emit event
    emit OrderExecuted(params.owner, coverId, id);

  }

  function cancelOrder(
    BuyCoverParams calldata params,
    ExecutionDetails calldata expirationDetails,
    bytes calldata signature
  ) external {

    bytes32 id = getOrderId(params, expirationDetails);

    // Recover the signer from the digest and the signature
    address signer = ECDSA.recover(id, signature);

    OrderDetails memory _orderDetails = orderDetails[id];

    if (_orderDetails.executionCounter > _orderDetails.maxRenewals) {
      revert OrderAlreadyExecuted();
    }

    if (_orderDetails.isCancelled) {
      revert OrderAlreadyCancelled();
    }

    if (signer != msg.sender) {
      revert NotOrderOwner();
    }

    _orderDetails.isCancelled = true;

    orderDetails[id] = _orderDetails;
    emit OrderCancelled(id);
  }

  /// @notice Returns the hash of the structured data of the order
  /// @param params Cover buy parameters
  /// @param executionDetails Start and end date when the order can be executed and max premium in asset
  /// @return structHash The hash of the structured data
  function getOrderId(
    BuyCoverParams calldata params,
    ExecutionDetails calldata executionDetails
  ) public view returns (bytes32 structHash) {
    // Hash the ExecutionDetails struct
    bytes32 executionDetailsHash = keccak256(
      abi.encode(
        keccak256("ExecutionDetails(uint256 notBefore,uint256 deadline,uint256 maxPremiumInAsset,uint8 maxNumberOfRenewals,uint32 renewWhenLeft)"),
        executionDetails.notBefore,
        executionDetails.deadline,
        executionDetails.maxPremiumInAsset,
        executionDetails.maxNumberOfRenewals,
        executionDetails.renewWhenLeft
      )
    );

    // Hash the structured data
    structHash = keccak256(
      abi.encode(
        EXECUTE_ORDER_TYPEHASH,
        params.coverId,
        params.productId,
        params.amount,
        params.period,
        params.paymentAsset,
        params.coverAsset,
        params.owner,
        keccak256(abi.encodePacked(params.ipfsData)),
        params.commissionRatio,
        params.commissionDestination,
        executionDetailsHash
      )
    );

    // Generate the digest (domain separator + struct hash)
    return _hashTypedDataV4(structHash);
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
    PoolAllocationRequest[] calldata poolAllocationRequests,
    uint solverFee
  ) internal returns (uint coverId) {

    uint ethBalanceBefore = address(this).balance;

    weth.transferFrom(buyer, address(this), params.maxPremiumInAsset);
    weth.withdraw(params.maxPremiumInAsset);

    coverId = cover().buyCoverFor{value: params.maxPremiumInAsset}(params, poolAllocationRequests);

    weth.transferFrom(address(this), msg.sender, solverFee);

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


  /// @notice Handles ERC20 payments for buying cover.
  /// @dev Transfers ERC20 tokens from the caller to the contract, then buys cover on behalf of the caller.
  /// Calculates ERC20 refunds if any and sends back to params.owner.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _buyCoverErc20Payment(
    address buyer,
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    uint solverFee
  ) internal returns (uint coverId) {

    address paymentAsset = pool().getAsset(params.paymentAsset).assetAddress;
    IERC20 erc20 = IERC20(paymentAsset);

    uint erc20BalanceBefore = erc20.balanceOf(address(this));

    erc20.safeTransferFrom(buyer, address(this), params.maxPremiumInAsset);
    coverId = cover().buyCoverFor(params, poolAllocationRequests);

    erc20.safeTransfer(msg.sender, solverFee);

    uint erc20BalanceAfter = erc20.balanceOf(address(this));

    // send any ERC20 refund back to buyer
    if (erc20BalanceAfter > erc20BalanceBefore) {
      uint erc20Refund = erc20BalanceAfter - erc20BalanceBefore;
      erc20.safeTransfer(buyer, erc20Refund);
    }

    return coverId;
  }

  /// @notice Allows the Cover contract to spend the maximum possible amount of a specified ERC20 token on behalf of the CoverOrder.
  /// @param erc20 The ERC20 token for which to approve spending.
  function maxApproveCoverContract(IERC20 erc20) external {
    erc20.safeApprove(internalContracts[uint(ID.CO)], type(uint256).max);
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
