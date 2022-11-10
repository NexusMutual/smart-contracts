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

enum CoverUintParams {
  globalCapacityRatio,
  globalRewardsRatio,
  coverAssetsFallback
}


struct PoolAllocationRequest {
  uint40 poolId;
  uint coverAmountInAsset;
}

struct PoolAllocation {
  uint40 poolId;
  uint96 coverAmountInNXM;
  uint96 premiumInNXM;
}

struct CoverData {
  uint24 productId;
  uint8 coverAsset;
  uint96 amountPaidOut;
}

struct CoverSegment {
  uint96 amount;
  uint32 start;
  uint32 period;  // seconds
  uint16 gracePeriodInDays;
  uint16 priceRatio;
  bool expired;
  uint24 globalRewardsRatio;
}

struct BuyCoverParams {
  address owner;
  uint24 productId;
  uint8 coverAsset;
  uint96 amount;
  uint32 period;
  uint maxPremiumInAsset;
  uint8 paymentAsset;
  bool payWithNXM;
  uint16 commissionRatio;
  address commissionDestination;
  string ipfsData;
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
  address yieldTokenAddress;
  /*
    cover assets bitmap. each bit in the base-2 representation represents whether the asset with the index
    of that bit is enabled as a cover asset for this product.
  */
  uint32 coverAssets;
  uint16 initialPriceRatio;
  uint16 capacityReductionRatio;
}

// Updatable fields for an already existing product
struct ProductUpdate {
  /*
    cover assets bitmap. each bit in the base-2 representation represents whether the asset with the index
    of that bit is enabled as a cover asset for this product.
  */
  uint32 coverAssets;
  uint16 initialPriceRatio;
  uint16 capacityReductionRatio;
}

struct ProductType {
  uint8 claimMethod;
  uint16 gracePeriodInDays;
}

interface ICover {

  /* ========== VIEWS ========== */

  function coverData(uint id) external view returns (CoverData memory);

  function coverSegmentsCount(uint coverId) external view returns (uint);

  function coverSegments(uint coverId, uint segmentId) external view returns (CoverSegment memory);

  function products(uint id) external view returns (Product memory);

  function productTypes(uint id) external view returns (ProductType memory);

  function isAssetSupported(uint32 coverAssetsBitMap, uint8 coverAsset) external view returns (bool);

  function stakingPool(uint index) external view returns (IStakingPool);

  function stakingPoolCount() external view returns (uint64);

  function productsCount() external view returns (uint);

  function activeCoverAmountCommitted() external view returns (bool);

  function MAX_COVER_PERIOD() external view returns (uint);

  function totalActiveCoverInAsset(uint24 coverAsset) external view returns (uint);

  function globalCapacityRatio() external view returns (uint24);

  function getPriceAndCapacityRatios(uint[] calldata productIds) external view returns (
    uint _globalCapacityRatio,
    uint _globalMinPriceRatio,
    uint[] memory _initialPriceRatios,
    uint[] memory _capacityReductionRatios
  );

  /* === MUTATIVE FUNCTIONS ==== */

  function migrateCovers(uint[] calldata coverIds, address newOwner) external returns (uint[] memory newCoverIds);

  function migrateCoverFromOwner(uint coverId, address fromOwner, address newOwner) external;

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external payable returns (uint /*coverId*/);

  function addProducts(
    Product[] calldata newProducts,
    string[] calldata ipfsMetadata
  ) external;

  function addProductTypes(
    ProductType[] calldata newProductTypes,
    string[] calldata ipfsMetadata
  ) external;

  function editProductTypes(
    uint[] calldata productTypeIds,
    uint16[] calldata gracePeriodsInDays,
    string[] calldata ipfsMetadata
  ) external;

  function editProducts(
    uint[] calldata productIds,
    ProductUpdate[] calldata productUpdates,
    string[] calldata ipfsMetadata
  ) external;

  function performStakeBurn(
    uint coverId,
    uint segmentId,
    uint amount
  ) external returns (address /*owner*/);

  function coverNFT() external view returns (address);

  function transferCovers(address from, address to, uint256[] calldata coverIds) external;

  function createStakingPool(
    address manager,
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] calldata params,
    uint depositAmount,
    uint trancheId
  ) external returns (address stakingPoolAddress);

  /* ========== EVENTS ========== */

  event StakingPoolCreated(address stakingPoolAddress, uint poolId, address manager, address stakingPoolImplementation);
  event ProductSet(uint id, string ipfsMetadata);
  event ProductTypeSet(uint id, string ipfsMetadata);
  event CoverBought(uint coverId, uint productId, uint segmentId, address buyer, string ipfsMetadata);
  event CoverEdited(uint coverId, uint productId, uint segmentId, address buyer);
  event CoverExpired(uint coverId, uint segmentId);
  event CoverMigrated(uint oldCoverId, address fromOwner, address newOwner, uint newCoverId);
}
