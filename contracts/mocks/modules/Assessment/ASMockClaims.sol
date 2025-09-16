// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../../interfaces/IClaims.sol";
import "../../../interfaces/IAssessments.sol";
import "../../../interfaces/ICover.sol";
import "../../../abstract/RegistryAware.sol";
import "../../../modules/assessment/AssessmentLib.sol";

/// @title ASMockClaims - Mock Claims contract for Assessment testing
/// @dev Simplified Claims implementation for testing purposes
contract ASMockClaims is IClaims, RegistryAware {
  using AssessmentLib for Assessment;

  /* ========== STATE VARIABLES ========== */

  mapping(uint claimId => Claim) private _claims;
  mapping(uint coverId => uint claimId) public lastClaimSubmissionOnCover;

  uint public cooldownPeriod;
  uint public redemptionPeriod;

  uint private _nextClaimId = 1;

  /* =========== CONSTANTS =========== */

  uint constant public PAYOUT_REDEMPTION_PERIOD = 30 days;
  uint constant public CLAIM_DEPOSIT_IN_ETH = 0.1 ether;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _registry) RegistryAware(_registry) {}

  // Allow the contract to receive ETH (needed for impersonation in tests)
  receive() external payable {}

  /* ========== INTERNAL FUNCTIONS ========== */

  function _assessments() internal view returns (IAssessments) {
    return IAssessments(fetch(C_ASSESSMENTS));
  }

  /* ========== VIEWS ========== */

  function getClaimsCount() external override view returns (uint) {
    return _nextClaimId - 1;
  }

  function getClaim(uint claimId) external override view returns (Claim memory) {
    return _claims[claimId];
  }

  function getClaimDetails(uint claimId) external override view returns (ClaimDetails memory) {
    Assessment memory assessment = _assessments().getAssessment(claimId);
    Claim memory claim = _claims[claimId];

    // Mock cover data for testing
    CoverData memory mockCover = CoverData({
      productId: uint24(claim.coverId),
      coverAsset: claim.coverAsset,
      amount: claim.amount,
      start: uint32(block.timestamp - 30 days),
      period: uint32(365 days),
      gracePeriod: uint32(30 days),
      rewardsRatio: 0,
      capacityRatio: 0
    });

    return ClaimDetails({
      claimId: claimId,
      claim: claim,
      cover: mockCover,
      assessment: assessment,
      status: assessment.getStatus(),
      outcome: assessment.getOutcome(),
      redeemable: false, // NOTE: amend as necessary
      ipfsMetadata: bytes32(0)
    });
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  function setCooldownAndRedemptionPeriod(uint _cooldownPeriod, uint _redemptionPeriod) external {
    cooldownPeriod = _cooldownPeriod;
    redemptionPeriod = _redemptionPeriod;
  }

  /// @notice Simplified submit claim for testing
  /// @dev Calls assessment.startAssessment and stores the claim
  /// @dev productTypeId is set to coverId for testing
  function submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    bytes32 ipfsMetadata
  ) external payable override returns (Claim memory claim) {

    uint claimId = _nextClaimId++;
    lastClaimSubmissionOnCover[coverId] = claimId;

    // For testing, set product type id to coverId
    uint16 productTypeId = uint16(coverId);

    // Start the assessment
    _assessments().startAssessment(claimId, productTypeId, cooldownPeriod);

    // Create and store the claim
    claim = Claim({
      coverId: coverId,
      amount: requestedAmount,
      coverAsset: 0, // ETH for simplicity
      payoutRedemptionPeriod: uint32(redemptionPeriod),
      payoutRedeemed: false,
      depositRetrieved: false
    });

    _claims[claimId] = claim;

    emit ClaimSubmitted(msg.sender, claimId, coverId, 1); // productId = 1 for testing

    if (ipfsMetadata != bytes32(0)) {
      emit MetadataSubmitted(claimId, ipfsMetadata);
    }

    return claim;
  }

  function redeemClaimPayout(uint) external pure override {
    revert("Unsupported");
  }

  function retrieveDeposit(uint) external pure override {
    revert("Unsupported");
  }
}
