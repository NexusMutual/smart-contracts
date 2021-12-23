// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface ICover {

  /* ========== DATA STRUCTURES ========== */

  enum RedeemMethod {
    Claim,
    Incident
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

  struct CoverChunkRequest {
    uint64 poolId;
    uint coverAmountInAsset;
  }

  struct CoverChunk {
    uint64 poolId;
    uint96 coverAmountInNXM;
    uint96 premiumInNXM;
  }

  struct CoverData {
    uint24 productId;
    uint8 payoutAsset;
    uint96 amountPaidOut;
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
    CoverChunkRequest[] coverChunkRequests;
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
    string descriptionIpfsHash;
    uint8 redeemMethod;
    uint16 gracePeriodInDays;
  }

  /* ========== VIEWS ========== */

  function covers(uint id) external view returns (uint24, uint8, uint96, uint32, uint32, uint16);

  function products(uint id) external view returns (uint16, address, uint32, uint16, uint16);

  function productTypes(uint id) external view returns (string memory, uint8, uint16);

  /* === MUTATIVE FUNCTIONS ==== */

  function migrateCover(uint coverId, address toNewOwner) external;

  function migrateCoverFromOwner(uint coverId, address fromOwner, address toNewOwner) external;

  function buyCover(
    BuyCoverParams calldata params,
    CoverChunkRequest[] calldata coverChunkRequests
  ) external payable returns (uint /*coverId*/);

  function performPayoutBurn(uint coverId, uint amount) external returns (address /*owner*/);

  function coverNFT() external returns (address);

  /* ========== EVENTS ========== */

}
