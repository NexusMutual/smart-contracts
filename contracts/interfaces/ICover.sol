// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICoverNFT.sol";
import "./IStakingNFT.sol";
import "./IStakingPool.sol";
import "./IStakingPoolFactory.sol";

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

/* io structs */

struct PoolAllocationRequest {
  uint40 poolId;
  bool skip;
  uint coverAmountInAsset;
}

struct RequestAllocationVariables {
  uint previousPoolAllocationsLength;
  uint previousPremiumInNXM;
  uint refund;
  uint coverAmountInNXM;
}

struct BuyCoverParams {
  uint coverId;
  address owner;
  uint24 productId;
  uint8 coverAsset;
  uint96 amount;
  uint32 period;
  uint maxPremiumInAsset;
  uint8 paymentAsset;
  uint16 commissionRatio;
  address commissionDestination;
  string ipfsData;
}

struct ProductParam {
  string productName;
  uint productId;
  string ipfsMetadata;
  Product product;
  uint[] allowedPools;
}

struct ProductTypeParam {
  string productTypeName;
  uint productTypeId;
  string ipfsMetadata;
  ProductType productType;
}

struct ProductInitializationParams {
  uint productId;
  uint8 weight;
  uint96 initialPrice;
  uint96 targetPrice;
}

/* storage structs */

struct PoolAllocation {
  uint40 poolId;
  uint96 coverAmountInNXM;
  uint96 premiumInNXM;
  uint24 allocationId;
}

struct CoverData {
  uint24 productId;
  uint8 coverAsset;
  uint96 amountPaidOut;
}

struct CoverSegment {
  uint96 amount;
  uint32 start;
  uint32 period; // seconds
  uint32 gracePeriod; // seconds
  uint24 globalRewardsRatio;
  uint24 globalCapacityRatio;
}

struct Product {
  uint16 productType;
  address yieldTokenAddress;
  // cover assets bitmap. each bit represents whether the asset with
  // the index of that bit is enabled as a cover asset for this product
  uint32 coverAssets;
  uint16 initialPriceRatio;
  uint16 capacityReductionRatio;
  bool isDeprecated;
  bool useFixedPrice;
}

struct ProductType {
  uint8 claimMethod;
  uint32 gracePeriod;
}

struct ActiveCover {
  // Global active cover amount per asset.
  uint192 totalActiveCoverInAsset;
  // The last time activeCoverExpirationBuckets was updated
  uint64 lastBucketUpdateId;
}

interface ICover {

  /* ========== VIEWS ========== */

  function coverData(uint coverId) external view returns (CoverData memory);

  function coverDataCount() external view returns (uint);

  function coverSegmentsCount(uint coverId) external view returns (uint);

  function coverSegments(uint coverId) external view returns (CoverSegment[] memory);

  function coverSegmentWithRemainingAmount(
    uint coverId,
    uint segmentId
  ) external view returns (CoverSegment memory);

  function products(uint id) external view returns (Product memory);

  function productTypes(uint id) external view returns (ProductType memory);

  function stakingPool(uint index) external view returns (IStakingPool);

  function productNames(uint productId) external view returns (string memory);

  function productsCount() external view returns (uint);

  function productTypesCount() external view returns (uint);

  function totalActiveCoverInAsset(uint coverAsset) external view returns (uint);

  function globalCapacityRatio() external view returns (uint);

  function globalRewardsRatio() external view returns (uint);

  function getPriceAndCapacityRatios(uint[] calldata productIds) external view returns (
    uint _globalCapacityRatio,
    uint _globalMinPriceRatio,
    uint[] memory _initialPriceRatios,
    uint[] memory _capacityReductionRatios
  );

  /* === MUTATIVE FUNCTIONS ==== */

  function addLegacyCover(
    uint productId,
    uint coverAsset,
    uint amount,
    uint start,
    uint period,
    address newOwner
  ) external returns (uint coverId);

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external payable returns (uint coverId);

  function setProductTypes(ProductTypeParam[] calldata productTypes) external;

  function setProducts(ProductParam[] calldata params) external;

  function burnStake(
    uint coverId,
    uint segmentId,
    uint amount
  ) external returns (address coverOwner);

  function coverNFT() external returns (ICoverNFT);

  function stakingNFT() external returns (IStakingNFT);

  function stakingPoolFactory() external returns (IStakingPoolFactory);

  function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] calldata productInitParams,
    string calldata ipfsDescriptionHash
  ) external returns (uint poolId, address stakingPoolAddress);

  function isPoolAllowed(uint productId, uint poolId) external returns (bool);
  function requirePoolIsAllowed(uint[] calldata productIds, uint poolId) external view;

  /* ========== EVENTS ========== */

  event ProductSet(uint id, string ipfsMetadata);
  event ProductTypeSet(uint id, string ipfsMetadata);
  event CoverEdited(uint indexed coverId, uint indexed productId, uint indexed segmentId, address buyer, string ipfsMetadata);

  // Auth
  error OnlyMemberRolesCanOperateTransfer();
  error OnlyOwnerOrApproved();

  // Cover details
  error CoverPeriodTooShort();
  error CoverPeriodTooLong();
  error CoverOutsideOfTheGracePeriod();
  error CoverAmountIsZero();

  // Products
  error ProductDoesntExist();
  error ProductTypeNotFound();
  error ProductDoesntExistOrIsDeprecated();
  error InvalidProductType();
  error UnexpectedProductId();
  error PoolNotAllowedForThisProduct(uint productId);

  // Cover and payment assets
  error CoverAssetNotSupported();
  error InvalidPaymentAsset();
  error UnexpectedCoverAsset();
  error UnsupportedCoverAssets();
  error UnexpectedEthSent();
  error EditNotSupported();

  // Price & Commission
  error PriceExceedsMaxPremiumInAsset();
  error TargetPriceBelowGlobalMinPriceRatio();
  error InitialPriceRatioBelowGlobalMinPriceRatio();
  error InitialPriceRatioAbove100Percent();
  error CommissionRateTooHigh();

  // ETH transfers
  error InsufficientEthSent();
  error SendingEthToPoolFailed();
  error SendingEthToCommissionDestinationFailed();
  error ReturningEthRemainderToSenderFailed();

  // Misc
  error AlreadyInitialized();
  error ExpiredCoversCannotBeEdited();
  error CoverNotYetExpired(uint coverId);
  error CoverAlreadyExpired(uint coverId);
  error InsufficientCoverAmountAllocated();
  error UnexpectedPoolId();
  error CapacityReductionRatioAbove100Percent();
}
