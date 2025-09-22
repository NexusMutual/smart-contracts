// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/RegistryAware.sol";
import "../../interfaces/IAssessments.sol";
import "../../interfaces/IClaims.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IRamm.sol";
import "../../libraries/Math.sol";
import "./AssessmentLib.sol";

/// Provides a way for cover owners to submit claims and redeem payouts. It is an entry point to
/// the assessment process where the members of the mutual decide the outcome of claims.
contract Claims is IClaims, RegistryAware {
  using AssessmentLib for Assessment;

  /* ========== STATE VARIABLES ========== */

  mapping(uint claimId => Claim) private _claims;

  // Mapping from coverId to claimId used to check if a new claim can be submitted on the given
  // cover as long as the last submitted claim reached a final state.
  mapping(uint coverId => uint claimId) public lastClaimSubmissionOnCover;

  mapping(uint memberId => uint[] claimIds) private _memberClaims;

  mapping(uint claimId => bytes32) private _claimsMetadata;

  uint private _nextClaimId;

  /* =========== IMMUTABLES =========== */

  ICover public immutable cover;
  ICoverNFT public immutable coverNFT;
  ICoverProducts public immutable coverProducts;
  IAssessments public immutable assessments;
  IPool public immutable pool;
  IRamm public immutable ramm;

  /* =========== CONSTANTS =========== */

  // NOTE: when updating the deposit value, make sure there are no open claims during the upgrade
  uint constant public CLAIM_DEPOSIT_IN_ETH = 0.05 ether;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _registry) RegistryAware(_registry) {
    cover = ICover(fetch(C_COVER));
    coverNFT = ICoverNFT(fetch(C_COVER_NFT));
    coverProducts = ICoverProducts(fetch(C_COVER_PRODUCTS));
    assessments = IAssessments(fetch(C_ASSESSMENTS));
    pool = IPool(fetch(C_POOL));
    ramm = IRamm(fetch(C_RAMM));
  }

  function initialize(uint lastClaimId) external onlyContracts(C_GOVERNOR) {
    require(_nextClaimId == 0, AlreadyInitialized());
    _nextClaimId = lastClaimId + 1;
  }

  /* ========== VIEWS ========== */

  function getClaimsCount() external override view returns (uint) {
    return _nextClaimId;
  }

  function getClaim(uint claimId) external override view returns (Claim memory) {
    return _claims[claimId];
  }

  /// Returns a Claim with its Cover, Assessment and AssessmentStatus
  ///
  /// @dev This view is meant to be used in user interfaces to get a claim in a format suitable for
  ///      displaying all relevant information in as few calls as possible
  /// @param claimId    Claim identifier for which the ClaimDetails is returned
  function getClaimDetails(uint claimId) external view returns (ClaimDetails memory) {

    Claim memory claim = _claims[claimId];
    require(claim.coverId > 0, InvalidClaimId());

    CoverData memory _cover = cover.getCoverData(claim.coverId);
    Assessment memory assessment = assessments.getAssessment(claimId);

    return ClaimDetails({
      claimId: claimId,
      claim: claim,
      cover: _cover,
      assessment: assessment,
      status: assessment.getStatus(),
      outcome: assessment.getOutcome(),
      redeemable: _isClaimRedeemable(claim, assessment),
      ipfsMetadata: _claimsMetadata[claimId]
    });
  }

  function getMemberClaims(uint memberId) external view returns (uint[] memory) {
    return _memberClaims[memberId];
  }

  /// @dev To be redeemable assessment outcome must be accepted, redemption period must not pass,
  ///      and claim must not be already redeemed
  function _isClaimRedeemable(Claim memory claim, Assessment memory assessment) internal view returns (bool) {
    return
      assessment.getOutcome() == AssessmentOutcome.ACCEPTED &&
      block.timestamp < assessment.votingEnd + assessment.cooldownPeriod + claim.payoutRedemptionPeriod &&
      !claim.payoutRedeemed;
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  /// Submits a claim for assessment for a specific cover
  ///
  /// @dev Requires a claim deposit fee. See: CLAIM_DEPOSIT_IN_ETH
  /// @dev Requires the sender to be a member and the owner or approved operator of the cover NFT
  ///
  /// @param coverId          Cover identifier
  /// @param requestedAmount  The amount expected to be received at payout
  /// @param ipfsMetadata     An IPFS hash that stores metadata about the claim that is emitted as
  ///                         an event. It's required for proof of loss. If this string is empty,
  ///                         no event is emitted.
  function submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    bytes32 ipfsMetadata
  ) external payable override whenNotPaused(PAUSE_CLAIMS) returns (Claim memory claim) {

    uint memberId = registry.getMemberId(msg.sender);
    require(memberId > 0, OnlyMember());
    require(coverNFT.ownerOf(coverId) == msg.sender, NotCoverOwner());

    uint claimId = _nextClaimId++;
    _memberClaims[memberId].push(claimId);

    {
      uint previousClaimId = lastClaimSubmissionOnCover[coverId];

      if (previousClaimId > 0) {
        Claim memory previousClaim = _claims[previousClaimId];
        Assessment memory assessment = assessments.getAssessment(previousClaimId);

        require(assessment.getStatus() == AssessmentStatus.FINALIZED, ClaimIsBeingAssessed());
        require(!_isClaimRedeemable(previousClaim, assessment), PayoutCanStillBeRedeemed());
      }

      lastClaimSubmissionOnCover[coverId] = claimId;
    }

    CoverData memory coverData = cover.getCoverData(coverId);

    (Product memory product, ProductType memory productType) = coverProducts.getProductWithType(coverData.productId);

    require(productType.claimMethod == ClaimMethod.IndividualClaims, InvalidClaimMethod());
    require(requestedAmount <= coverData.amount, CoveredAmountExceeded());
    require(block.timestamp > coverData.start, CantBuyCoverAndClaimInTheSameBlock());
    require(uint(coverData.start) + uint(coverData.period) + uint(coverData.gracePeriod) > block.timestamp, GracePeriodPassed());

    emit ClaimSubmitted(
      msg.sender,
      claimId,
      coverId,
      coverData.productId
    );

    assessments.startAssessment(claimId, product.productType, productType.assessmentCooldownPeriod);

    claim = Claim({
      coverId: coverId,
      amount: requestedAmount,
      coverAsset: coverData.coverAsset,
      payoutRedemptionPeriod: productType.payoutRedemptionPeriod,
      payoutRedeemed: false,
      depositRetrieved: false
    });

    _claims[claimId] = claim;

    if (ipfsMetadata != bytes32(0)) {
      _claimsMetadata[claimId] = ipfsMetadata;
      emit MetadataSubmitted(claimId, ipfsMetadata);
    }

    require(msg.value == CLAIM_DEPOSIT_IN_ETH, AssessmentDepositNotExact());

    // Transfer the assessment deposit to the pool
    (
      bool transferSucceeded,
      /* bytes data */
    ) =  address(pool).call{value: CLAIM_DEPOSIT_IN_ETH}("");
    require(transferSucceeded, AssessmentDepositTransferToPoolFailed());

    return claim;
  }

  /// Redeems payouts and sends assessment deposit back for accepted claims
  ///
  /// @dev Must be the cover NFT owner for the claim and a member can call this function
  ///
  /// @param claimId  Claim identifier
  function redeemClaimPayout(uint claimId) external override onlyMember whenNotPaused(PAUSE_CLAIMS) {

    Claim memory claim = _claims[claimId];
    require(claim.coverId > 0, InvalidClaimId());

    address coverOwner = coverNFT.ownerOf(claim.coverId);
    require(coverOwner == msg.sender, NotCoverOwner());

    Assessment memory assessment = assessments.getAssessment(claimId);
    require(_isClaimRedeemable(claim, assessment), ClaimNotRedeemable());

    _claims[claimId].payoutRedeemed = true;
    _claims[claimId].depositRetrieved = true;

    ramm.updateTwap();

    cover.burnStake(claim.coverId, claim.amount);

    // Send payout in cover asset
    pool.sendPayout(claim.coverAsset, payable(coverOwner), claim.amount, CLAIM_DEPOSIT_IN_ETH);

    emit ClaimPayoutRedeemed(coverOwner, claim.amount, claimId, claim.coverId);
    emit ClaimDepositRetrieved(claimId, coverOwner);
  }

  /// Allows the cover owner to retrieve their claim deposit if their claim is resolved as DRAW.
  ///
  /// @dev Can be called by anyone, but the claim deposit is always transferred to the current cover NFT owner.
  ///
  /// @param claimId The unique identifier of the claim for which the deposit is being retrieved.
  function retrieveDeposit(uint claimId) external override whenNotPaused(PAUSE_CLAIMS) {
    Claim memory claim = _claims[claimId];
    require(claim.coverId > 0, InvalidClaimId());

    require(
      assessments.getAssessment(claimId).getOutcome() == AssessmentOutcome.DRAW,
      ClaimNotADraw()
    );

    require(!claim.depositRetrieved, DepositAlreadyRetrieved());

    _claims[claimId].depositRetrieved = true;

    address payable coverOwner = payable(coverNFT.ownerOf(claim.coverId));

    pool.sendPayout(0, payable(coverOwner), 0, CLAIM_DEPOSIT_IN_ETH);

    emit ClaimDepositRetrieved(claimId, coverOwner);
  }
}
