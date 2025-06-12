// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/RegistryAware.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/IClaims.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IRamm.sol";
import "../../libraries/Math.sol";

/// Provides a way for cover owners to submit claims and redeem payouts. It is an entry point to
/// the assessment process where the members of the mutual decide the outcome of claims.
contract Claims is IClaims, RegistryAware {

  /* ========== STATE VARIABLES ========== */

  // TODO: public?
  mapping(uint claimId => Claim) private _claims;

  // Mapping from coverId to claimId used to check if a new claim can be submitted on the given
  // cover as long as the last submitted claim reached a final state.
  mapping(uint coverId => uint claimId) public lastClaimSubmissionOnCover;

  uint private _nextClaimId;

  /* =========== CONSTANTS =========== */

  uint constant public PAYOUT_REDEMPTION_PERIOD = 30 days;

  uint constant public CLAIM_DEPOSIT_IN_ETH = 0.1 ether; // TODO: set deposit amount

  /* ========== CONSTRUCTOR ========== */

  constructor(address _registry) RegistryAware(_registry) {
    _nextClaimId = 1; // TODO: start from the last claim Id 
  }

  /* ========== VIEWS ========== */

  function _cover() internal view returns (ICover) {
    return ICover(fetch(C_COVER));
  }

  function _coverNFT() internal view returns (ICoverNFT) {
    return ICoverNFT(fetch(C_COVER_NFT));
  }

  function _coverProducts() internal view returns (ICoverProducts) {
    return ICoverProducts(fetch(C_COVER_PRODUCTS));
  }

  function _assessment() internal view returns (IAssessment) {
    return IAssessment(fetch(C_ASSESSMENT));
  }

  function _pool() internal view returns (IPool) {
    return IPool(fetch(C_POOL));
  }

  function _ramm() internal view returns (IRamm) {
    return IRamm(fetch(C_RAMM));
  }

  function getClaimsCount() external override view returns (uint) {
    return _nextClaimId - 1;
  }

  function getClaimInfo(uint claimId) external view returns (Claim memory) {
    return _claims[claimId];
  }

  function getPayoutRedemptionPeriod() external pure returns (uint) {
    return PAYOUT_REDEMPTION_PERIOD;
  }

  // TODO: check to move to Claim+Assessment Viewer

  /// Returns a Claim aggregated in a human-friendly format.
  ///
  /// @dev This view is meant to be used in user interfaces to get a claim in a format suitable for
  /// displaying all relevant information in as few calls as possible. See ClaimDisplay struct.
  ///
  /// @param claimId    Claim identifier for which the ClaimDisplay is returned
  function getClaimDisplay(uint claimId) internal view returns (ClaimDisplay memory) {
    Claim memory claim = _claims[claimId];

    (
      uint acceptVotes,
      uint denyVotes,
      ,
      uint32 start,
      uint32 end,
      uint32 finalizedAt
    ) = _assessment().getAssessmentInfo(claimId);

    ClaimStatus claimStatus = ClaimStatus.PENDING;
    PayoutStatus payoutStatus = PayoutStatus.PENDING;
    {
      // Determine the claims status
      if (finalizedAt > 0) {
        if (acceptVotes > denyVotes) {
          claimStatus = ClaimStatus.ACCEPTED;
        } else {
          claimStatus = ClaimStatus.DENIED;
        }
      }

      // Determine the payout status
      if (claimStatus == ClaimStatus.ACCEPTED) {
        if (claim.payoutRedeemed) {
          payoutStatus = PayoutStatus.COMPLETE;
        } else {
          if (
            block.timestamp >= finalizedAt + PAYOUT_REDEMPTION_PERIOD
          ) {
            payoutStatus = PayoutStatus.UNCLAIMED;
          }
        }
      } else if (claimStatus == ClaimStatus.DENIED) {
        payoutStatus = PayoutStatus.DENIED;
      }
    }

    CoverData memory coverData = _cover().getCoverData(claim.coverId);

    uint expiration = coverData.start + coverData.period;

    string memory assetSymbol;
    if (claim.coverAsset == 0) {
      assetSymbol = "ETH";
    } else {

      address assetAddress = _pool().getAsset(claim.coverAsset).assetAddress;
      try IERC20Detailed(assetAddress).symbol() returns (string memory v) {
        assetSymbol = v;
      } catch {
        // return assetSymbol as an empty string and use claim.coverAsset instead in the UI
      }
    }

    return ClaimDisplay(
      claimId,
      coverData.productId,
      claim.coverId,
      claim.amount,
      assetSymbol,
      claim.coverAsset,
      coverData.start,
      expiration,
      start,
      end,
      uint(claimStatus),
      uint(payoutStatus)
    );
  }

  /// Returns an array of claims aggregated in a human-friendly format.
  ///
  /// @dev This view is meant to be used in user interfaces to get claims in a format suitable for
  /// displaying all relevant information in as few calls as possible. It can be used to paginate
  /// claims by providing the following parameters:
  ///
  /// @param ids   Array of Claim ids which are returned as ClaimDisplay
  function getClaimsToDisplay (uint[] calldata ids)
  external view returns (ClaimDisplay[] memory) {
    ClaimDisplay[] memory claimDisplays = new ClaimDisplay[](ids.length);
    for (uint i = 0; i < ids.length; i++) {
      uint id = ids[i];
      claimDisplays[i] = getClaimDisplay(id);
    }
    return claimDisplays;
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  /// Submits a claim for assessment
  function submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    string calldata ipfsMetadata
  ) external payable override whenNotPaused(C_CLAIMS) returns (Claim memory claim) {
    require(registry.isMember(msg.sender), OnlyMember());
    require(_coverNFT().isApprovedOrOwner(msg.sender, coverId), OnlyOwnerOrApprovedCanSubmitClaim());
    return _submitClaim(coverId, requestedAmount, ipfsMetadata, msg.sender);
  }

  function _submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    string calldata ipfsMetadata,
    address owner
  ) internal returns (Claim memory) {

    uint claimId = _nextClaimId++;

    {
      uint previousSubmission = lastClaimSubmissionOnCover[coverId];

      if (previousSubmission > 0) {
        (uint acceptVotes, uint denyVotes,,,,uint32 finalizedAt) = _assessment().getAssessmentInfo(previousSubmission);
        require(finalizedAt > 0, ClaimIsBeingAssessed());
        require(
          acceptVotes < denyVotes ||
          block.timestamp >= finalizedAt + PAYOUT_REDEMPTION_PERIOD,
          PayoutCanStillBeRedeemed()
        );
      }

      lastClaimSubmissionOnCover[coverId] = claimId;
    }

    CoverData memory coverData = _cover().getCoverData(coverId);

    (Product memory product, ProductType memory productType) = _coverProducts().getProductWithType(coverData.productId);

    require(productType.claimMethod == ClaimMethod.IndividualClaims, InvalidClaimMethod());
    require(requestedAmount <= coverData.amount, CoveredAmountExceeded()); 
    require(block.timestamp > coverData.start, CantBuyCoverAndClaimInTheSameBlock());
    require(uint(coverData.start) + uint(coverData.period) + uint(coverData.gracePeriod) > block.timestamp, GracePeriodPassed());

    emit ClaimSubmitted(
      owner,              // claim submitter
      claimId,      // claimId
      coverId,            // coverId
      coverData.productId // user
    );

    _assessment().startAssessment(claimId, product.productType);

    Claim memory claim = Claim({
      coverId: coverId,
      amount: requestedAmount,
      coverAsset: coverData.coverAsset,
      payoutRedeemed: false
    });

    _claims[claimId] = claim;

    if (bytes(ipfsMetadata).length > 0) {
      emit MetadataSubmitted(claimId, ipfsMetadata);
    }

    require(msg.value >= CLAIM_DEPOSIT_IN_ETH, AssessmentDepositInsufficient());
    if (msg.value > CLAIM_DEPOSIT_IN_ETH) {
      // Refund ETH excess back to the sender
      (
        bool refunded,
        /* bytes data */
      ) = owner.call{value: msg.value - CLAIM_DEPOSIT_IN_ETH}("");
      require(refunded, AssessmentDepositTrasnferRefundFailed());
    }

    // Transfer the assessment deposit to the pool
    (
      bool transferSucceeded,
      /* bytes data */
    ) =  address(_pool()).call{value: CLAIM_DEPOSIT_IN_ETH}("");
    require(transferSucceeded, AssessmentDepositTransferToPoolFailed());
    return claim;
  }

  /// Redeems payouts for accepted claims
  ///
  /// @dev Anyone can call this function, the payout always being transfered to the NFT owner.
  /// When the tokens are transfered the assessment deposit is also sent back.
  ///
  /// @param claimId  Claim identifier
  function redeemClaimPayout(uint104 claimId) external override whenNotPaused(C_CLAIMS) {
    Claim memory claim = _claims[claimId];

    // Close the assessment if it's not already closed
    _assessment().closeAssessment(claimId);

    (uint acceptVotes,uint denyVotes, , , , uint32 finalizedAt) = _assessment().getAssessmentInfo(claimId);

    require(finalizedAt > 0, ClaimAssessmentNotFinished());
    require(acceptVotes > denyVotes, ClaimNotAccepted());

    require(block.timestamp < finalizedAt + PAYOUT_REDEMPTION_PERIOD, RedemptionPeriodExpired());

    require(!claim.payoutRedeemed, PayoutAlreadyRedeemed());
    _claims[claimId].payoutRedeemed = true;

    _ramm().updateTwap();
    address payable coverOwner = payable(_cover().burnStake(
      claim.coverId,
      claim.amount
    ));

    // Send payout in cover asset
    _pool().sendPayout(claim.coverAsset, coverOwner, claim.amount, CLAIM_DEPOSIT_IN_ETH);

    emit ClaimPayoutRedeemed(coverOwner, claim.amount, claimId, claim.coverId);
  }
}
