// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../utils/SafeUintCast.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/ICoverNFT.sol";

library MigrateCoverLib {


  struct MigrateParams {
    uint coverId;
    address fromOwner;
    address toNewOwner;
    ICoverNFT coverNFT;
    IQuotationData quotationData;
    ITokenController tokenController;
    IProductsV1 productsV1;
  }

  function _migrateCoverFromOwner(
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


    // mint the new cover
    uint productId = params.productsV1.getNewProductId(legacyProductId);
    Product memory product = _products[productId];
    ProductType memory productType = _productTypes[product.productType];
    require(
      block.timestamp < validUntil + productType.gracePeriodInDays * 1 days,
      "Cover outside of the grace period"
    );

    uint newCoverId = _coverData.length;

    _coverData.push(
      CoverData(
        uint24(productId),
        currencyCode == "ETH" ? 0 : 1, //payoutAsset
        0 // amountPaidOut
      )
    );

    _coverSegments[newCoverId].push(
      CoverSegment(
        SafeUintCast.toUint96(sumAssured * 10 ** 18),
        SafeUintCast.toUint32(validUntil - coverPeriodInDays * 1 days),
        SafeUintCast.toUint32(coverPeriodInDays * 1 days),
        uint16(0)
      )
    );

    params.coverNFT.safeMint(params.toNewOwner, newCoverId);
  }
}