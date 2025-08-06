// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IClaims {

  enum ClaimStatus { PENDING, ACCEPTED, DENIED }

  enum PayoutStatus { PENDING, COMPLETE, UNCLAIMED, DENIED }

  struct Claim {
    uint32 coverId;
    uint96 amount;
    uint8 coverAsset; // asset id in the Pool contract
    bool payoutRedeemed;
    bool depositRetrieved;
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
    uint amount;
    string assetSymbol;
    uint assetIndex;
    uint coverStart;
    uint coverEnd;
    uint assessmentStart;
    uint assessmentVotingEnd;
    uint assessmentCooldownEnd;
    uint assessmentStatus;
    uint payoutRedemptionEnd;
    bool payoutRedeemed;
  }

  /* ========== VIEWS ========== */

  function getClaimInfo(uint claimId) external view returns (Claim memory);

  function getClaimsCount() external view returns (uint);

  /* === MUTATIVE FUNCTIONS ==== */

  function submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    bytes32 ipfsMetadata
  ) external payable returns (Claim memory);

  function redeemClaimPayout(uint id) external;

  function retrieveDeposit(uint claimId) external;

  /* ========== EVENTS ========== */

  event ClaimSubmitted(address indexed user, uint claimId, uint indexed coverId, uint productId);
  event MetadataSubmitted(uint indexed claimId, bytes32 ipfsMetadata);
  event ClaimPayoutRedeemed(address indexed user, uint amount, uint claimId, uint coverId);
  event ClaimDepositRetrieved(uint indexed claimId, address indexed user);

  /* ========== ERRORS ========== */

  error ClaimIsBeingAssessed();
  error PayoutCanStillBeRedeemed();
  error ClaimAlreadyPaidOut();
  error NotCoverOwner();
  error InvalidClaimMethod();
  error CoveredAmountExceeded();
  error CantBuyCoverAndClaimInTheSameBlock();
  error GracePeriodPassed();
  error AssessmentDepositNotExact();
  error AssessmentDepositTransferToPoolFailed();
  error InvalidAssessmentStatus();
  error RedemptionPeriodExpired();
  error PayoutAlreadyRedeemed();
  error DepositAlreadyRetrieved();
  error InvalidClaimId();
  error AlreadyInitialized();
}
