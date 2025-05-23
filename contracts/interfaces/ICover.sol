// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICoverNFT.sol";
import "./IStakingNFT.sol";
import "./IStakingPool.sol";
import "./ICompleteStakingPoolFactory.sol";

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

struct LegacyCoverData {
  uint24 productId;
  uint8 coverAsset;
  uint96 amountPaidOut;
}

struct LegacyCoverSegment {
  uint96 amount;
  uint32 start;
  uint32 period; // seconds
  uint32 gracePeriod; // seconds
  uint24 globalRewardsRatio;
  uint24 globalCapacityRatio;
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

interface ICover {

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

  function getPoolAllocations(uint coverId) external view returns (PoolAllocation[] memory);

  function getCoverDataCount() external view returns (uint);

  function getCoverReference(uint coverId) external view returns(CoverReference memory);

  function getCoverDataWithReference(uint coverId) external view returns (CoverData memory, CoverReference memory);

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

  function burnStake(uint coverId, uint amount) external returns (address coverOwner);

  function coverNFT() external returns (ICoverNFT);

  function stakingNFT() external returns (IStakingNFT);

  function stakingPoolFactory() external returns (ICompleteStakingPoolFactory);

  /* ========== EVENTS ========== */

  event CoverBought(
    uint indexed coverId,
    uint indexed originalCoverId,
    uint productId,
    address indexed buyer,
    string ipfsMetadata
  );

  // left here for legacy support (frontend needs it to scan past events)
  event CoverEdited(
    uint indexed coverId,
    uint indexed productId,
    uint indexed unused,
    address buyer,
    string ipfsMetadata
  );

  // Auth
  error OnlyOwnerOrApproved();

  // Cover details
  error CoverPeriodTooShort();
  error CoverPeriodTooLong();
  error CoverOutsideOfTheGracePeriod();
  error CoverAmountIsZero();

  // Products
  error ProductNotFound();
  error ProductDeprecated();
  error UnexpectedProductId();

  // Cover and payment assets
  error CoverAssetNotSupported();
  error InvalidPaymentAsset();
  error UnexpectedCoverAsset();
  error UnexpectedEthSent();
  error EditNotSupported();
  error MustBeOriginalCoverId(uint originalCoverId);

  // Price & Commission
  error PriceExceedsMaxPremiumInAsset();
  error CommissionRateTooHigh();

  // ETH transfers
  error InsufficientEthSent();
  error SendingEthToPoolFailed();
  error SendingEthToCommissionDestinationFailed();
  error ReturningEthRemainderToSenderFailed();

  // Misc
  error ExpiredCoversCannotBeEdited();
  error CoverNotYetExpired(uint coverId);
  error InsufficientCoverAmountAllocated();
  error UnexpectedPoolId();
  error AlreadyMigratedCoverData(uint coverId);
}
