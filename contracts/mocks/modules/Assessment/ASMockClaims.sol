// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../../interfaces/IClaims.sol";
import "../../../interfaces/IAssessment.sol";
import "../../../abstract/RegistryAware.sol";

/// @title ASMockClaims - Mock Claims contract for Assessment testing
/// @dev Simplified Claims implementation for testing purposes
contract ASMockClaims is IClaims, RegistryAware {

  /* ========== STATE VARIABLES ========== */

  mapping(uint claimId => Claim) private _claims;
  mapping(uint coverId => uint claimId) public lastClaimSubmissionOnCover;

  uint private _nextClaimId = 1;

  /* =========== CONSTANTS =========== */

  uint constant public PAYOUT_REDEMPTION_PERIOD = 30 days;
  uint constant public CLAIM_DEPOSIT_IN_ETH = 0.1 ether;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _registry) RegistryAware(_registry) {}

  // Allow the contract to receive ETH (needed for impersonation in tests)
  receive() external payable {}

  /* ========== INTERNAL FUNCTIONS ========== */

  function _assessment() internal view returns (IAssessment) {
    return IAssessment(fetch(C_ASSESSMENT));
  }

  /* ========== VIEWS ========== */

  function getClaimsCount() external override view returns (uint) {
    return _nextClaimId - 1;
  }

  function getClaimInfo(uint claimId) external override view returns (Claim memory) {
    return _claims[claimId];
  }

  function getPayoutRedemptionPeriod() external override pure returns (uint) {
    return PAYOUT_REDEMPTION_PERIOD;
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  /// @notice Simplified submit claim for testing
  /// @dev Calls assessment.startAssessment and stores the claim
  function submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    bytes32 ipfsMetadata
  ) external payable override returns (Claim memory claim) {

    uint claimId = _nextClaimId++;
    lastClaimSubmissionOnCover[coverId] = claimId;

    // For testing, use a simple product type ID
    uint16 productTypeId = 1;

    // Start the assessment
    _assessment().startAssessment(claimId, productTypeId);

    // Create and store the claim
    claim = Claim({
      coverId: coverId,
      amount: requestedAmount,
      coverAsset: 0, // ETH for simplicity
      payoutRedeemed: false
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