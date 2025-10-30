// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IAssessments.sol";
import "./ICover.sol";

interface IClaims {

  struct Claim {
    uint32 coverId;
    uint96 amount;
    uint8 coverAsset; // asset id in the Pool contract
    uint32 payoutRedemptionPeriod;
    bool payoutRedeemed;
    bool depositRetrieved;
  }

  struct ClaimDetails {
    uint claimId;
    Claim claim;
    CoverData cover;
    Assessment assessment;
    AssessmentStatus status;
    AssessmentOutcome outcome;
    bool redeemable;
    bytes32 ipfsMetadata;
  }

  /* ========== VIEWS ========== */

  function getClaim(uint claimId) external view returns (Claim memory);

  function getClaimsCount() external view returns (uint);

  function getClaimDetails(uint claimId) external view returns (ClaimDetails memory);

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
  error ClaimNotRedeemable();
  error DepositAlreadyRetrieved();
  error InvalidClaimId();
  error AlreadyInitialized();
  error ClaimNotADraw();
  error ClaimNotAccepted();
}
