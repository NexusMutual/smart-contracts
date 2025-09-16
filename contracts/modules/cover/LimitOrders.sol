// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ILimitOrders.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ITokenController.sol";

contract LimitOrders is ILimitOrders, MasterAwareV2, EIP712 {
  using ECDSA for bytes32;
  using SafeERC20 for IERC20;

  /* ========== STATE VARIABLES ========== */
  mapping(bytes32 => OrderStatus) public orderStatus;

  /* ========== IMMUTABLES ========== */
  INXMToken public immutable nxmToken;
  IWeth public immutable weth;
  address public immutable internalSolver;

  /* ========== CONSTANTS ========== */
  uint private constant ETH_ASSET_ID = 0;
  uint private constant NXM_ASSET_ID = type(uint8).max;
  uint public constant MAX_RENEWABLE_PERIOD_BEFORE_EXPIRATION = 10 days;

  bytes32 private constant EXECUTE_ORDER_TYPEHASH = keccak256(
    abi.encodePacked(
      "ExecuteOrder(",
      "OrderDetails orderDetails,",
      "ExecutionDetails executionDetails)",
      // ExecutionDetails
      "ExecutionDetails(",
      "address buyer,",
      "uint256 notExecutableBefore,",
      "uint256 executableUntil,",
      "uint256 renewableUntil,",
      "uint256 renewablePeriodBeforeExpiration,",
      "uint256 maxPremiumInAsset)",
      // OrderDetails
      "OrderDetails(",
      "uint256 coverId,",
      "uint24 productId,",
      "uint96 amount,",
      "uint32 period,",
      "uint8 paymentAsset,",
      "uint8 coverAsset,",
      "address owner,",
      "string ipfsData,",
      "uint16 commissionRatio,",
      "address commissionDestination)"
    )
  );

  modifier onlyInternalSolver() {
    require(msg.sender == internalSolver, OnlyInternalSolver());
    _;
  }

  /* ========== CONSTRUCTOR ========== */
  constructor(address _nxmTokenAddress, address _wethAddress, address _internalSolver) EIP712("NexusMutualLimitOrders", "1.0.0") {
    nxmToken = INXMToken(_nxmTokenAddress);
    weth = IWeth(_wethAddress);
    internalSolver = _internalSolver;
  }

  /// @notice Executes the order to buy cover on behalf of the creator of limit order
  /// @notice Function only allows users to pay with coverAsset or NXM, this is being checked in the Cover contract
  /// @param params Cover buy parameters
  /// @param poolAllocationRequests Pool allocations for the cover
  /// @param executionDetails Start and end date when the order can be executed and max premium in asset
  /// @param signature The signature of the order
  /// @param settlementDetails Fee related details
  /// @return coverId The ID of the purchased cover
  function executeOrder(
    BuyCoverParams memory params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    ExecutionDetails calldata executionDetails,
    bytes calldata signature,
    SettlementDetails calldata settlementDetails
  ) external onlyInternalSolver returns (uint coverId) {

    require(params.owner != address(0) && params.owner != address(this), InvalidOwnerAddress());
    require(executionDetails.maxPremiumInAsset >= settlementDetails.fee + params.maxPremiumInAsset, OrderPriceNotMet());

    bytes32 orderId = getOrderId(params, executionDetails);
    address buyer = ECDSA.recover(orderId, signature);

    require(executionDetails.buyer == buyer, InvalidBuyerAddress());
    require(
      executionDetails.renewablePeriodBeforeExpiration <= MAX_RENEWABLE_PERIOD_BEFORE_EXPIRATION,
      RenewablePeriodBeforeExpirationExceedsMaximum()
    );

    OrderStatus memory _orderStatus = orderStatus[orderId];

    // Ensure the order is not cancelled
    require(!_orderStatus.isCancelled, OrderAlreadyCancelled());

    uint originalCoverId = _orderStatus.coverId != 0
      ? _orderStatus.coverId
      : params.coverId;

    bool isNewCover = originalCoverId == 0;

    if (isNewCover) {
      require(block.timestamp < executionDetails.executableUntil, OrderExpired()); // end_date
      require(block.timestamp > executionDetails.notExecutableBefore, OrderCannotBeExecutedYet()); // end_date - renewablePeriodBeforeExpiration
    } else {

      params.coverId = originalCoverId;

      CoverData memory coverData = cover().getLatestEditCoverData(originalCoverId);
      uint expiresAt = coverData.start + coverData.period;
      uint renewableAfter = expiresAt - executionDetails.renewablePeriodBeforeExpiration;

      require(block.timestamp < executionDetails.renewableUntil, RenewalExpired());
      require(block.timestamp > renewableAfter, OrderCannotBeRenewedYet());
      require(expiresAt > block.timestamp, ExpiredCoverCannotBeRenewed());
    }

    // ETH payment
    if (params.paymentAsset == ETH_ASSET_ID) {
      coverId = _buyCoverEthPayment(buyer, params, poolAllocationRequests, settlementDetails);
    } else {
      // ERC20 payment
      coverId = _buyCoverErc20Payment(buyer, params, poolAllocationRequests, settlementDetails);
    }

    if (_orderStatus.coverId == 0) {
      originalCoverId = params.coverId != 0 ? params.coverId : coverId;
      _orderStatus.coverId = uint32(originalCoverId);
    }

    orderStatus[orderId] = _orderStatus;

    // Emit event
    emit OrderExecuted(params.owner, originalCoverId, coverId, orderId);
  }

  function cancelOrder(
    BuyCoverParams calldata params,
    ExecutionDetails calldata executionDetails,
    bytes calldata signature
  ) external {

    bytes32 orderId = getOrderId(params, executionDetails);

    // Recover the signer from the digest and the signature
    address signer = ECDSA.recover(orderId, signature);

    require(signer == msg.sender, NotOrderOwner());

    require(executionDetails.buyer == msg.sender, InvalidBuyerAddress());

    OrderStatus memory _orderStatus = orderStatus[orderId];

    require(!_orderStatus.isCancelled, OrderAlreadyCancelled());

    _orderStatus.isCancelled = true;

    orderStatus[orderId] = _orderStatus;
    emit OrderCancelled(orderId);
  }

  /// @notice Returns the hash of the structured data of the order
  /// @param params Cover buy parameters
  /// @param executionDetails Start and end date when the order can be executed and max premium in asset
  /// @return structHash The hash of the structured data
  function getOrderId(
    BuyCoverParams memory params,
    ExecutionDetails calldata executionDetails
  ) public view returns (bytes32 structHash) {
    // Hash the ExecutionDetails struct
    bytes32 executionDetailsHash = keccak256(
      abi.encode(
        keccak256("ExecutionDetails(address buyer,uint256 notExecutableBefore,uint256 executableUntil,uint256 renewableUntil,uint256 renewablePeriodBeforeExpiration,uint256 maxPremiumInAsset)"),
        executionDetails.buyer,
        executionDetails.notExecutableBefore,
        executionDetails.executableUntil,
        executionDetails.renewableUntil,
        executionDetails.renewablePeriodBeforeExpiration,
        executionDetails.maxPremiumInAsset
      )
    );
    // Hash the OrderDetails struct
    bytes32 orderDetailsHash = keccak256(
      abi.encode(
        keccak256("OrderDetails(uint256 coverId,uint24 productId,uint96 amount,uint32 period,uint8 paymentAsset,uint8 coverAsset,address owner,string ipfsData,uint16 commissionRatio,address commissionDestination)"),
          params.coverId,
          params.productId,
          params.amount,
          params.period,
          params.paymentAsset,
          params.coverAsset,
          params.owner,
          keccak256(abi.encodePacked(params.ipfsData)),
          params.commissionRatio,
          params.commissionDestination
      )
    );

    // Hash the structured data
    structHash = keccak256(
      abi.encode(
        EXECUTE_ORDER_TYPEHASH,
        orderDetailsHash,
        executionDetailsHash
      )
    );

    // Generate the digest (domain separator + struct hash)
    return _hashTypedDataV4(structHash);
  }

  /// @notice Handles ETH/WETH payments for buying cover.
  /// @dev Transfers WETH tokens from the order creator to the contract, then unwraps it,  then buys cover on behalf of the creator.
  ///      Calculates ETH refunds if any and sends back to param.owner.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @param settlementDetails Fee related details.
  /// @return coverId The ID of the purchased cover.
  function _buyCoverEthPayment(
    address buyer,
    BuyCoverParams memory params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    SettlementDetails calldata settlementDetails
  ) internal returns (uint coverId) {

    uint ethBalanceBefore = address(this).balance;

    weth.transferFrom(buyer, address(this), params.maxPremiumInAsset);
    weth.withdraw(params.maxPremiumInAsset);

    coverId = cover().executeCoverBuy{value: params.maxPremiumInAsset}(params, poolAllocationRequests, buyer);

    if (settlementDetails.fee > 0) {
      weth.transferFrom(buyer, settlementDetails.feeDestination, settlementDetails.fee);
    }

    uint ethBalanceAfter = address(this).balance;

    // transfer any ETH refund back to signer
    if (ethBalanceAfter > ethBalanceBefore) {
      uint ethRefund = ethBalanceAfter - ethBalanceBefore;
      weth.deposit{ value: ethRefund }();

      weth.transferFrom(address(this), buyer, ethRefund);
    }

    return coverId;
  }

  /// @notice Handles ERC20 payments for buying cover.
  /// @dev Transfers ERC20 tokens from the caller to the contract, then buys cover on behalf of the caller.
  /// Calculates ERC20 refunds if any and sends back to params.owner.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @param settlementDetails Fee related details.
  /// @return coverId The ID of the purchased cover.
  function _buyCoverErc20Payment(
    address buyer,
    BuyCoverParams memory params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    SettlementDetails calldata settlementDetails
  ) internal returns (uint coverId) {

    address paymentAsset = params.paymentAsset == NXM_ASSET_ID
      ? address(nxmToken)
      : pool().getAsset(params.paymentAsset).assetAddress;

    IERC20 erc20 = IERC20(paymentAsset);
    uint erc20BalanceBefore = erc20.balanceOf(address(this));

    erc20.safeTransferFrom(buyer, address(this), params.maxPremiumInAsset);
    coverId = cover().executeCoverBuy(params, poolAllocationRequests, buyer);

    if (settlementDetails.fee > 0) {
      erc20.safeTransferFrom(buyer, settlementDetails.feeDestination, settlementDetails.fee);
    }

    uint erc20BalanceAfter = erc20.balanceOf(address(this));

    // send any ERC20 refund back to buyer
    if (erc20BalanceAfter > erc20BalanceBefore) {
      uint erc20Refund = erc20BalanceAfter - erc20BalanceBefore;
      erc20.safeTransfer(buyer, erc20Refund);
    }

    return coverId;
  }

  /// @notice Allows the Cover contract to spend the maximum possible amount of a specified ERC20 token on behalf of the LimitOrders.
  /// @param erc20 The ERC20 token for which to approve spending.
  function maxApproveCoverContract(IERC20 erc20) external {
    erc20.safeApprove(internalContracts[uint(ID.CO)], type(uint256).max);
  }

  /// @notice Allows the Token Controller contract to spend the maximum possible amount of a NXM token on behalf of the LimitOrders.
  function maxApproveTokenControllerContract() external {
    nxmToken.approve(internalContracts[uint(ID.TC)], type(uint256).max);
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

  /// @return The TokenController's instance
  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
  }

  receive() external payable {}
}
