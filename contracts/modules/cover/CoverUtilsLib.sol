// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/SafeUintCast.sol";
import "../../interfaces/IPool.sol";
import "./MinimalBeaconProxy.sol";


library CoverUtilsLib {
  using SafeERC20 for IERC20;

  uint private constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint private constant COMMISSION_DENOMINATOR = 10_000;

  struct MigrateParams {
    uint coverId;
    address fromOwner;
    address toNewOwner;
    ICoverNFT coverNFT;
    IQuotationData quotationData;
    ITokenController tokenController;
    IProductsV1 productsV1;
  }

  struct PoolInitializationParams {
    uint poolId;
    address manager;
    bool isPrivatePool;
    uint initialPoolFee;
    uint maxPoolFee;
  }

  function migrateCoverFromOwner(
    MigrateParams memory params,
    Product[] storage _products,
    ProductType[] storage _productTypes,
    CoverData[] storage _coverData,
    mapping(uint => CoverSegment[]) storage _coverSegments
  ) external {

    (
      /*uint coverId*/,
      address coverOwner,
      address legacyProductId,
      bytes4 currencyCode,
      /*uint sumAssured*/,
      /*uint premiumNXM*/
    ) = params.quotationData.getCoverDetailsByCoverID1(params.coverId);

    (
      /*uint coverId*/,
      uint8 status,
      uint sumAssured,
      uint16 coverPeriodInDays,
      uint validUntil
    ) = params.quotationData.getCoverDetailsByCoverID2(params.coverId);

    require(params.fromOwner == coverOwner, "Cover can only be migrated by its owner");
    require(LegacyCoverStatus(status) != LegacyCoverStatus.Migrated, "Cover has already been migrated");
    require(LegacyCoverStatus(status) != LegacyCoverStatus.ClaimAccepted, "A claim has already been accepted");

    {
      (uint claimCount , bool hasOpenClaim,  /*hasAcceptedClaim*/) = params.tokenController.coverInfo(params.coverId);
      require(!hasOpenClaim, "Cover has an open V1 claim");
      require(claimCount < 2, "Cover already has 2 claims");
    }

    // Mark cover as migrated to prevent future calls on the same cover
    params.quotationData.changeCoverStatusNo(params.coverId, uint8(LegacyCoverStatus.Migrated));

    {
      // Mint the new cover
      uint productId = params.productsV1.getNewProductId(legacyProductId);
      Product memory product = _products[productId];
      ProductType memory productType = _productTypes[product.productType];
      require(
        block.timestamp < validUntil + productType.gracePeriodInDays * 1 days,
        "Cover outside of the grace period"
      );

      _coverData.push(
        CoverData(
          uint24(productId),
          currencyCode == "ETH" ? 0 : 1, // payoutAsset
          0 // amountPaidOut
        )
      );
    }

    uint newCoverId = _coverData.length - 1;

    _coverSegments[newCoverId].push(
      CoverSegment(
        SafeUintCast.toUint96(sumAssured * 10 ** 18), // amount
        SafeUintCast.toUint32(validUntil - coverPeriodInDays * 1 days), // start
        SafeUintCast.toUint32(coverPeriodInDays * 1 days), // period
        uint16(0), // priceRatio
        false, // expired
        0 // global rewards ratio //
      )
    );

    params.coverNFT.safeMint(params.toNewOwner, newCoverId);
  }

  function calculateProxyCodeHash(address coverProxyAddress) external pure returns (bytes32) {
    return keccak256(
      abi.encodePacked(
      type(MinimalBeaconProxy).creationCode,
      abi.encode(coverProxyAddress)
    ));
  }

  function createStakingPool(
    Product[] storage products,
    PoolInitializationParams memory poolInitParams,
    ProductInitializationParams[] memory productInitParams,
    uint depositAmount,
    uint trancheId,
    address pooledStakingAddress
  ) external returns (address stakingPoolAddress) {

    stakingPoolAddress = address(
      new MinimalBeaconProxy{ salt: bytes32(poolInitParams.poolId) }(address(this))
    );

    if (msg.sender != pooledStakingAddress) {

      // override with initial price
      for (uint i = 0; i < productInitParams.length; i++) {
        productInitParams[0].initialPrice = products[productInitParams[i].productId].initialPriceRatio;
      }
    }

    // will create the ownership nft
    IStakingPool newStakingPool = IStakingPool(stakingPoolAddress);
    newStakingPool.initialize(
      poolInitParams.manager,
      poolInitParams.isPrivatePool,
      poolInitParams.initialPoolFee,
      poolInitParams.maxPoolFee,
      productInitParams,
      poolInitParams.poolId
    );

    // will create nft with a position in the desired tranche id
    if (depositAmount > 0) {
      DepositRequest[] memory requests = new DepositRequest[](1);
      requests[0] = DepositRequest(depositAmount, trancheId, 0, poolInitParams.manager);
      newStakingPool.depositTo(requests);
    }
  }

  function stakingPool(uint index, bytes32 stakingPoolProxyCodeHash) public view returns (IStakingPool) {

    bytes32 hash = keccak256(
      abi.encodePacked(bytes1(0xff), address(this), index, stakingPoolProxyCodeHash)
    );
    // cast last 20 bytes of hash to address
    return IStakingPool(address(uint160(uint(hash))));
  }

  function performStakeBurn(
    uint coverId,
    uint burnAmount,
    ICoverNFT coverNFT,
    CoverData storage cover,
    CoverSegment memory segment,
    PoolAllocation[] storage allocations,
    bytes32 stakingPoolProxyCodeHash,
    uint globalCapacityRatio
  ) external returns (address /* owner */) {

    // increase amountPaidOut only *after* you read the segment
    cover.amountPaidOut += SafeUintCast.toUint96(burnAmount);

    uint allocationCount = allocations.length;
    for (uint i = 0; i < allocationCount; i++) {

      PoolAllocation memory allocation = allocations[i];

      uint burnAmountInNXM = allocation.coverAmountInNXM
      * burnAmount / segment.amount
      * GLOBAL_CAPACITY_DENOMINATOR / globalCapacityRatio;

      stakingPool(i, stakingPoolProxyCodeHash).burnStake(cover.productId, segment.start, segment.period, burnAmountInNXM);

      uint payoutAmountInNXM = allocation.coverAmountInNXM * burnAmount / segment.amount;
      allocations[i].coverAmountInNXM -= SafeUintCast.toUint96(payoutAmountInNXM);
    }

    return coverNFT.ownerOf(coverId);
  }

  function retrievePayment(
    uint premium,
    uint8 paymentAsset,
    uint16 commissionRatio,
    address commissionDestination,
    IPool _pool
  ) external {

    // add commission
    uint commission = premium * commissionRatio / COMMISSION_DENOMINATOR;

    if (paymentAsset == 0) {

      uint premiumWithCommission = premium + commission;
      require(msg.value >= premiumWithCommission, "Cover: Insufficient ETH sent");

      uint remainder = msg.value - premiumWithCommission;

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, "Cover: Returning ETH remainder to sender failed.");
      }

      // send commission
      if (commission > 0) {
        (bool ok, /* data */) = address(commissionDestination).call{value: commission}("");
        require(ok, "Cover: Sending ETH to commission destination failed.");
      }

      return;
    }

    (
    address payoutAsset,
    /*uint8 decimals*/
    ) = _pool.coverAssets(paymentAsset);

    IERC20 token = IERC20(payoutAsset);
    token.safeTransferFrom(msg.sender, address(_pool), premium);

    if (commission > 0) {
      token.safeTransferFrom(msg.sender, commissionDestination, commission);
    }
  }
}
