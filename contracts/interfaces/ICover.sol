// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IStakingPool.sol";

/* ========== DATA STRUCTURES ========== */

enum ClaimMethod {
  IndividualClaims,
  YieldTokenIncidents
}

// Basically CoverStatus from QuotationData.sol but with the extra Migrated status to avoid
// polluting Cover.sol state layout with new status variables.
enum LegacyCoverStatus {
  Active,
  ClaimAccepted,
  ClaimDenied,
  CoverExpired,
  ClaimSubmitted,
  Requested,
  Migrated
}

struct PoolAllocationRequest {
  uint64 poolId;
  uint coverAmountInAsset;
}

struct PoolAllocation {
  uint64 poolId;
  uint96 coverAmountInNXM;
  uint96 premiumInNXM;
}

struct CoverData {
  uint24 productId;
  uint8 payoutAsset;
  uint96 amountPaidOut;
  bool expired;
}

struct CoverSegment {
  uint96 amount;
  uint32 start;
  uint32 period;  // seconds
  uint16 priceRatio;
}

struct BuyCoverParams {
  address owner;
  uint24 productId;
  uint8 payoutAsset;
  uint96 amount;
  uint32 period;
  uint maxPremiumInAsset;
  uint8 paymentAsset;
  bool payWithNXM;
  uint16 commissionRatio;
  address commissionDestination;
}

struct IncreaseAmountAndReducePeriodParams {
  uint coverId;
  uint32 periodReduction;
  uint96 amount;
  uint8 paymentAsset;
  uint maxPremiumInAsset;
}

struct ProductBucket {
  uint96 coverAmountExpiring;
}

struct IncreaseAmountParams {
  uint coverId;
  uint8 paymentAsset;
  PoolAllocationRequest[] coverChunkRequests;
}

struct Product {
  uint16 productType;
  address productAddress;
  /*
    cover assets bitmap. each bit in the base-2 representation represents whether the asset with the index
    of that bit is enabled as a cover asset for this product.
  */
  uint32 coverAssets;
  uint16 initialPriceRatio;
  uint16 capacityReductionRatio;
}

struct ProductType {
  // TODO: emit an event for ipfs hash
  string descriptionIpfsHash;
  uint8 claimMethod;
  uint16 gracePeriodInDays;
}

struct ActiveCoverForAsset {
  uint96 amount;
  uint96 lastCoverId;
}

interface ICover {


  /* ========== VIEWS ========== */

  function coverData(uint id) external view returns (CoverData memory);

  function coverSegmentsCount(uint coverId) external view returns (uint);

  function coverSegments(uint coverId, uint segmentId) external view returns (CoverSegment memory);

  function products(uint id) external view returns (Product memory);

  function productTypes(uint id) external view returns (ProductType memory);

  function isAssetSupported(uint32 payoutAssetsBitMap, uint8 payoutAsset) external view returns (bool);

  function stakingPoolCount() external view returns (uint64);

  function productsCount() external view returns (uint);

  /* === MUTATIVE FUNCTIONS ==== */

  function migrateCovers(uint[] calldata coverIds, address toNewOwner) external;

  function migrateCoverFromOwner(uint coverId, address fromOwner, address toNewOwner) external;

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external payable returns (uint /*coverId*/);

  function createStakingPool(
    address manager,
    ProductInitializationParams[] memory params
  ) external returns (address stakingPoolAddress);

  function setInitialPrices(
    uint[] calldata productId,
    uint16[] calldata initialPriceRatio
  ) external;

  function addProducts(Product[] calldata newProducts) external;

  function addProductTypes(ProductType[] calldata newProductTypes) external;

  function setCoverAssetsFallback(uint32 _coverAssetsFallback) external;

  function performPayoutBurn(
    uint coverId,
    uint segmentId,
    uint amount
  ) external returns (address /*owner*/);

  function coverNFT() external returns (address);

  function transferCovers(address from, address to, uint256[] calldata coverIds) external;

  /* ========== EVENTS ========== */


  function MAX_COVER_PERIOD() external view returns (uint);
}
