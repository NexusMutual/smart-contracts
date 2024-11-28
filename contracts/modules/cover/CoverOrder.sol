// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-v4/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/access/Ownable.sol";

import "../../interfaces/ICoverOrder.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IWeth.sol";
import "../../interfaces/IPool.sol";

contract CoverOrder is ICoverOrder, Ownable, EIP712 {
  using ECDSA for bytes32;
  using SafeERC20 for IERC20;

  /* ========== STATE VARIABLES ========== */
  mapping(bytes => bool) public executedOrders;

  /* ========== IMMUTABLES ========== */
  ICover public immutable cover;
  IMemberRoles public immutable memberRoles;
  INXMToken public immutable nxmToken;
  INXMMaster public immutable master;
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
      "ExecutionPeriod executionPeriod)",
      "ExecutionPeriod(uint256 startDate,uint256 endDate)"
    )
  );

  /* ========== CONSTRUCTOR ========== */
  constructor(
    address _master,
    address _weth,
    address _owner
  ) EIP712("NexusMutualCoverOrder", "1") {
    master = INXMMaster(_master);
    cover = ICover(master.getLatestAddress("CO"));
    memberRoles = IMemberRoles(master.getLatestAddress("MR"));
    nxmToken = INXMToken(master.tokenAddress());
    weth = IWeth(_weth);
    transferOwnership(_owner);
  }

  /// @notice Verifies and executes the order to buy cover on behalf of the creator of limit order
  /// @notice Function only allows users to pay with coverAsset or NXM, this is being checked the Cover contract
  /// @param params Cover buy parameters
  /// @param poolAllocationRequests Pool allocations for the cover
  /// @param executionPeriod Start and end date when the order can be executed
  /// @param signature The signature of the order
  function executeOrder(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests,
    ExecutionPeriod calldata executionPeriod,
    bytes calldata signature
  ) external payable returns (uint coverId) {

    if (block.timestamp > executionPeriod.endDate) {
      revert OrderExpired();
    }

    if (block.timestamp < executionPeriod.startDate) {
      revert OrderCannotBeExecutedYet();
    }

    if(!memberRoles.checkRole(msg.sender, uint(IMemberRoles.Role.Member))) {
      revert NotAMember();
    }

    if (params.owner == address(0) || params.owner == address(this)) {
      revert InvalidOwnerAddress();
    }

    address signer = _verifySignature(params, executionPeriod, signature);

    // Ensure the signer is the user who owns the order
    if (signer != params.owner) {
      revert InvalidSignature();
    }

    // Ensure the order has not already been executed
    if (executedOrders[signature]) {
      revert OrderAlreadyExecuted();
    }

    // Mark the order as executed
    executedOrders[signature] = true;

    // ETH payment
    if (params.paymentAsset == ETH_ASSET_ID) {
      return _buyCoverEthPayment(params, poolAllocationRequests);
    }

    // ERC20 payment
    return _buyCoverErc20Payment(params, poolAllocationRequests);
  }

  /// @notice Handles verification of the order signature
  /// @param params Cover buy parameters
  /// @param executionPeriod Start and end date when the order can be executed
  /// @param signature The signature of the order
  function _verifySignature(
    BuyCoverParams calldata params,
    ExecutionPeriod calldata executionPeriod,
    bytes calldata signature
  ) internal view returns (address) {

    // Hash the ExecutionPeriod struct
    bytes32 executionPeriodHash = keccak256(
      abi.encode(
        keccak256("ExecutionPeriod(uint256 startDate,uint256 endDate)"),
        executionPeriod.startDate,
        executionPeriod.endDate
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
        executionPeriodHash
      )
    );

    // Generate the digest (domain separator + struct hash)
    bytes32 digest = _hashTypedDataV4(structHash);

    // Recover the signer from the digest and the signature
    return ECDSA.recover(digest, signature);
  }

  /// @notice Handles ETH/WETH payments for buying cover.
  /// @dev Transfers WETH tokens from the order creator to the contract, then unwraps it,  then buys cover on behalf of the creator.
  //       Calculates ETH refunds if any and sends back to param.owner.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _buyCoverEthPayment(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) internal returns (uint coverId) {

    uint ethBalanceBefore = address(this).balance;

    weth.transferFrom(params.owner, address(this), params.maxPremiumInAsset);
    weth.withdraw(params.maxPremiumInAsset);

    coverId = cover.buyCover{value: params.maxPremiumInAsset}(params, poolAllocationRequests);

    uint ethBalanceAfter = address(this).balance;

    // transfer any ETH refund back to params.owner
    if (ethBalanceAfter > ethBalanceBefore) {
      uint ethRefund = ethBalanceAfter - ethBalanceBefore;
      weth.deposit{ value: ethRefund }();

      bool sent = weth.transferFrom(address(this), params.owner, ethRefund);

      if (!sent) {
        revert TransferFailed(msg.sender, ethRefund, ETH);
      }
    }

    // Emit event
    emit OrderExecuted(params.owner, coverId);
  }

  /// @notice Handles ERC20 payments for buying cover.
  /// @dev Transfers ERC20 tokens from the caller to the contract, then buys cover on behalf of the caller.
  /// Calculates ERC20 refunds if any and sends back to params.owner.
  /// @param params The parameters required to buy cover.
  /// @param poolAllocationRequests The allocation requests for the pool's liquidity.
  /// @return coverId The ID of the purchased cover.
  function _buyCoverErc20Payment(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata poolAllocationRequests
  ) internal returns (uint coverId) {

    address paymentAsset = _pool().getAsset(params.paymentAsset).assetAddress;
    IERC20 erc20 = IERC20(paymentAsset);

    uint erc20BalanceBefore = erc20.balanceOf(address(this));

    erc20.safeTransferFrom(params.owner, address(this), params.maxPremiumInAsset);
    coverId = cover.buyCover(params, poolAllocationRequests);

    uint erc20BalanceAfter = erc20.balanceOf(address(this));

    // send any ERC20 refund back to params.owner
    if (erc20BalanceAfter > erc20BalanceBefore) {
      uint erc20Refund = erc20BalanceAfter - erc20BalanceBefore;
      erc20.safeTransfer(params.owner, erc20Refund);
    }

    // Emit event
    emit OrderExecuted(params.owner, coverId);
  }

  /// @notice Allows the Cover contract to spend the maximum possible amount of a specified ERC20 token on behalf of the CoverOrder.
  /// @param erc20 The ERC20 token for which to approve spending.
  function maxApproveCoverContract(IERC20 erc20) external onlyOwner {
    erc20.safeApprove(address(cover), type(uint256).max);
  }

  /// @notice Switches CoverOrder's membership to a new address.
  /// @dev MemberRoles contract needs to be approved to transfer NXM tokens to new membership address.
  /// @param newAddress The address to which the membership will be switched.
  function switchMembership(address newAddress) external onlyOwner {
    nxmToken.approve(address(memberRoles), type(uint256).max);
    memberRoles.switchMembership(newAddress);
  }

  /// @notice Recovers all available funds of a specified asset (ETH or ERC20) to the contract owner.
  /// @param assetAddress The address of the asset to be rescued.
  function rescueFunds(address assetAddress) external onlyOwner {

    if (assetAddress == ETH) {
      uint ethBalance = address(this).balance;
      if (ethBalance == 0) {
        revert ZeroBalance(ETH);
      }

      (bool sent,) = payable(msg.sender).call{value: ethBalance}("");
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

    asset.safeTransfer(msg.sender, erc20Balance);
  }

  /* ========== DEPENDENCIES ========== */

  /// @dev Fetches the Pool's instance through master contract
  /// @return The Pool's instance
  function _pool() internal view returns (IPool) {
    return IPool(master.getLatestAddress("P1"));
  }

  receive() external payable {}
}
