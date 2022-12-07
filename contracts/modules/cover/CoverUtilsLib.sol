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
    address newOwner;
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
    uint globalMinPriceRatio;
  }

  function migrateCoverFromOwner(
    MigrateParams memory params,
    Product[] storage _products,
    ProductType[] storage _productTypes,
    CoverData[] storage _coverData,
    mapping(uint => CoverSegment[]) storage _coverSegments
  ) external returns (uint newCoverId) {

    address legacyProductId;
    bytes4 currencyCode;

    {
      address coverOwner;
      (
      /*uint coverId*/,
      coverOwner,
      legacyProductId,
      currencyCode,
      /*uint sumAssured*/,
      /*uint premiumNXM*/
      ) = params.quotationData.getCoverDetailsByCoverID1(params.coverId);
      require(params.fromOwner == coverOwner, "Cover can only be migrated by its owner");
    }
    (
      /*uint coverId*/,
      uint8 status,
      uint sumAssured,
      uint16 coverPeriodInDays,
      uint validUntil
    ) = params.quotationData.getCoverDetailsByCoverID2(params.coverId);

    {
      require(LegacyCoverStatus(status) != LegacyCoverStatus.Migrated, "Cover has already been migrated");
      require(LegacyCoverStatus(status) != LegacyCoverStatus.ClaimAccepted, "A claim has already been accepted");
    }

    {
      (uint claimCount , bool hasOpenClaim,  /*hasAcceptedClaim*/) = params.tokenController.coverInfo(params.coverId);
      require(!hasOpenClaim, "Cover has an open V1 claim");
      require(claimCount < 2, "Cover already has 2 claims");
    }

    // Mark cover as migrated to prevent future calls on the same cover
    params.quotationData.changeCoverStatusNo(params.coverId, uint8(LegacyCoverStatus.Migrated));
    ProductType memory productType;
    {
      // Mint the new cover
      uint productId = params.productsV1.getNewProductId(legacyProductId);
      productType = _productTypes[_products[productId].productType];
      require(
        block.timestamp < validUntil + productType.gracePeriod,
        "Cover outside of the grace period"
      );

      _coverData.push(
        CoverData(
          uint24(productId),
          currencyCode == "ETH" ? 0 : 1, // coverAsset
          0 // amountPaidOut
        )
      );
    }

    newCoverId = _coverData.length - 1;

    _coverSegments[newCoverId].push(
      CoverSegment(
        SafeUintCast.toUint96(sumAssured * 10 ** 18), // amount
        SafeUintCast.toUint32(validUntil - uint(coverPeriodInDays) * 1 days), // start
        SafeUintCast.toUint32(uint(coverPeriodInDays) * 1 days), // period
        productType.gracePeriod,
        0 // global rewards ratio //
      )
    );

    params.coverNFT.mint(params.newOwner, newCoverId);
    return newCoverId;
  }

  function calculateProxyCodeHash(address coverProxyAddress) external pure returns (bytes32) {
    return keccak256(
      abi.encodePacked(
        // TODO: compiler version - investigate
        //       I suspect that MinimalBeaconProxy might get compiled using
        //       the compiler version specified by the current contract
        type(MinimalBeaconProxy).creationCode,
        abi.encode(coverProxyAddress)
      )
    );
  }

  function createStakingPool(
    Product[] storage products,
    PoolInitializationParams memory poolInitParams,
    ProductInitializationParams[] memory productInitParams,
    uint depositAmount,
    uint trancheId,
    address pooledStakingAddress,
    string calldata ipfsDescriptionHash
  ) external returns (address stakingPoolAddress) {

    stakingPoolAddress = address(
      new MinimalBeaconProxy{ salt: bytes32(poolInitParams.poolId) }(address(this))
    );

    if (msg.sender != pooledStakingAddress) {

      // override with initial price
      for (uint i = 0; i < productInitParams.length; i++) {
        productInitParams[i].initialPrice = products[productInitParams[i].productId].initialPriceRatio;
        require(
          productInitParams[i].targetPrice >= poolInitParams.globalMinPriceRatio,
          "CoverUtilsLib: Target price below GLOBAL_MIN_PRICE_RATIO"
        );
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
      poolInitParams.poolId,
      ipfsDescriptionHash
    );

    // will create nft with a position in the desired tranche id
    if (depositAmount > 0) {
      newStakingPool.depositTo(depositAmount, trancheId, 0, poolInitParams.manager);
    }
  }

}
