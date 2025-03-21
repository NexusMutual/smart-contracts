// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IIndividualClaims {

  enum ClaimStatus { PENDING, ACCEPTED, DENIED }

  enum PayoutStatus { PENDING, COMPLETE, UNCLAIMED, DENIED }

  struct Claim {
    uint80 assessmentId;
    uint32 coverId;
    uint16 segmentId; // unused
    uint96 amount;
    uint8 coverAsset; // asset id in the Pool contract
    bool payoutRedeemed;
  }

  struct ClaimSubmission {
    uint80 claimId;
    // True when a previous submission exists
    bool exists;
  }

  // Claim structure but in a human-friendly format.
  //
  // Contains aggregated values that give an overall view about the claim and other relevant
  // pieces of information such as cover period, asset symbol etc. This structure is not used in
  // any storage variables.
  struct ClaimDisplay {
    uint id;
    uint productId;
    uint coverId;
    uint assessmentId;
    uint amount;
    string assetSymbol;
    uint assetIndex;
    uint coverStart;
    uint coverEnd;
    uint pollStart;
    uint pollEnd;
    uint claimStatus;
    uint payoutStatus;
  }

  /* ========== VIEWS ========== */

  function claims(uint id) external view returns (
    uint80 assessmentId,
    uint32 coverId,
    uint16 segmentId,
    uint96 amount,
    uint8 coverAsset,
    bool payoutRedeemed
  );

  function getPayoutRedemptionPeriod() external view returns (uint);

  function getMinAssessmentDepositRatio() external view returns (uint);

  function getMaxRewardInNxm() external view returns (uint);

  function getRewardRatio() external view returns (uint);

  function getClaimsCount() external view returns (uint);

  /* === MUTATIVE FUNCTIONS ==== */

  function submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    string calldata ipfsMetadata
  ) external payable returns (Claim memory);

  function redeemClaimPayout(uint104 id) external;

  /* ========== EVENTS ========== */

  event ClaimSubmitted(address indexed user, uint claimId, uint indexed coverId, uint productId);
  event MetadataSubmitted(uint indexed claimId, string ipfsMetadata);
  event ClaimPayoutRedeemed(address indexed user, uint amount, uint claimId, uint coverId);

}
