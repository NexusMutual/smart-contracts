// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICoverNFT.sol";
import "./ICoverProducts.sol";
import "./IStakingNFT.sol";
import "./IStakingPoolBeacon.sol";

/* io structs */

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

struct PoolAllocationRequest {
  uint poolId;
  uint coverAmountInAsset;
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
  uint96 amount;
  uint32 start;
  uint32 period;
  uint32 gracePeriod;
  uint16 rewardsRatio;
  uint16 capacityRatio;
}

struct CoverReference {
  uint32 originalCoverId; // set to 0 in the original cover
  uint32 latestCoverId; // used only in the original cover (set to 0 in original cover if never edited)
}

// reinsurance info
struct Ri {
  uint24 providerId;
  uint96 amount;
}

struct RiConfig {
  uint24 nextNonce;
  address premiumDestination;
}

struct RiRequest {
  uint providerId;
  uint amount;
  uint premium;
  bytes signature;
}

interface ICover is IStakingPoolBeacon {

  /* ========== DATA STRUCTURES ========== */

  /* internal structs */

  struct RequestAllocationVariables {
    uint previousPoolAllocationsLength;
    uint previousPremiumInNXM;
    uint refund;
    uint coverAmountInNXM;
  }

  /* storage structs */

  struct ActiveCover {
    // Global active cover amount per asset.
    uint192 totalActiveCoverInAsset;
    // The last time activeCoverExpirationBuckets was updated
    uint64 lastBucketUpdateId;
  }

  /* ========== VIEWS ========== */

  function getCoverData(uint coverId) external view returns (CoverData memory);

  function getCoverRi(uint coverId) external view returns (Ri memory);

  function getCoverDataWithRi(uint coverId) external view returns (CoverData memory, Ri memory);

  function getCoverReference(uint coverId) external view returns(CoverReference memory);

  function getCoverDataWithReference(uint coverId) external view returns (CoverData memory, CoverReference memory);

  function getCoverMetadata(uint coverId) external view returns (string memory);

  function getCoverDataCount() external view returns (uint);

  function getPoolAllocations(uint coverId) external view returns (PoolAllocation[] memory);

  function getLatestEditCoverData(uint coverId) external view returns (CoverData memory);

  function recalculateActiveCoverInAsset(uint coverAsset) external;

  function totalActiveCoverInAsset(uint coverAsset) external view returns (uint);

  function getGlobalCapacityRatio() external view returns (uint);

  function getGlobalRewardsRatio() external view returns (uint);

  function getDefaultMinPriceRatio() external pure returns (uint);

  function getGlobalCapacityAndPriceRatios() external view returns (
    uint _globalCapacityRatio,
    uint _defaultMinPriceRatio
  );

  function DEFAULT_MIN_PRICE_RATIO() external view returns (uint);

  function coverNFT() external returns (ICoverNFT);

  function stakingNFT() external returns (IStakingNFT);

  function stakingPoolFactory() external returns (address);

  function coverProducts() external returns (ICoverProducts);

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests
  ) external payable returns (uint coverId);

  function executeCoverBuy(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests,
    address buyer
  ) external payable returns (uint coverId);

  function buyCoverWithRi(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata coverChunkRequests,
    RiRequest calldata riRequest
  ) external payable returns (uint coverId);

  function burnStake(uint coverId, uint amount) external;

  /* ========== EVENTS ========== */

  event CoverBought(
    uint indexed coverId,
    uint indexed originalCoverId,
    uint indexed buyerMemberId,
    uint productId
  );

  // Auth
  error OnlyOwnerOrApproved();

  // Cover details
  error CoverPeriodTooShort();
  error CoverPeriodTooLong();
  error CoverAmountIsZero();
  error CoverAssetMismatch();

  // Products
  error ProductNotFound();
  error ProductDeprecated();

  // Cover and payment assets
  error CoverAssetNotSupported();
  error InvalidPaymentAsset();
  error UnexpectedEthSent();
  error EditNotSupported();
  error MustBeOriginalCoverId(uint originalCoverId);

  // Price & Commission
  error PriceExceedsMaxPremiumInAsset();
  error CommissionRateTooHigh();

  // ETH transfers
  error InsufficientEthSent();
  error ETHTransferFailed(address to, uint amount);

  // Misc
  error ExpiredCoversCannotBeEdited();
  error CoverNotYetExpired(uint coverId);
  error InsufficientCoverAmountAllocated();
  error AlreadyMigratedCoverData(uint coverId);

  // Ri
  error InvalidSignature();
  error WrongCoverEditEntrypoint();
  error RiAmountIsZero();
  error InvalidRiConfig();
  error UnexpectedRiPremium();
}
