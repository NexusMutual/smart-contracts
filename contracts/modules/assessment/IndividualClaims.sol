// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.27;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/IIndividualClaims.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IRamm.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

/// Provides a way for cover owners to submit claims and redeem payouts. It is an entry point to
/// the assessment process where the members of the mutual decide the outcome of claims.
contract IndividualClaims is IIndividualClaims, MasterAwareV2 {

  /* ========== STATE VARIABLES ========== */

  uint internal __unused_0; // was Configuration config

  Claim[] public override claims;

  // Mapping from coverId to claimId used to check if a new claim can be submitted on the given
  // cover as long as the last submitted claim reached a final state.
  mapping(uint => ClaimSubmission) public lastClaimSubmissionOnCover;

  /* =========== CONSTANTS =========== */

  uint constant public MIN_ASSESSMENT_DEPOSIT_RATIO = 500; // bps
  uint constant public MIN_ASSESSMENT_DEPOSIT_DENOMINATOR = 10000;

  uint constant public REWARD_RATIO = 130; // bps
  uint constant public REWARD_DENOMINATOR = 10000;

  uint constant public PAYOUT_REDEMPTION_PERIOD = 30 days;

  uint constant public ONE_NXM = 1 ether;
  uint constant public MAX_REWARD_IN_NXM = 50 * ONE_NXM;

  ICoverNFT public immutable coverNFT;

  /* ========== CONSTRUCTOR ========== */

  constructor(address coverNFTAddress) {
    coverNFT = ICoverNFT(coverNFTAddress);
  }

  /* ========== VIEWS ========== */

  function _cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  function _coverProducts() internal view returns (ICoverProducts) {
    return ICoverProducts(internalContracts[uint(ID.CP)]);
  }

  function _assessment() internal view returns (IAssessment) {
    return IAssessment(internalContracts[uint(ID.AS)]);
  }

  function _pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function _ramm() internal view returns (IRamm) {
    return IRamm(internalContracts[uint(ID.RA)]);
  }

  function getClaimsCount() external override view returns (uint) {
    return claims.length;
  }

  function getPayoutRedemptionPeriod() external pure override returns (uint) {
    return PAYOUT_REDEMPTION_PERIOD;
  }

  function getMinAssessmentDepositRatio() external pure override returns (uint) {
    return MIN_ASSESSMENT_DEPOSIT_RATIO;
  }

  function getMaxRewardInNxm() external pure override returns (uint) {
    return MAX_REWARD_IN_NXM;
  }

  function getRewardRatio() external pure override returns (uint) {
    return REWARD_RATIO;
  }

  /// Returns the required assessment deposit and total reward for a new claim
  ///
  /// @dev This view is meant to be used either by users or user interfaces to determine the
  /// minimum assessment deposit value of the submitClaim tx.
  ///
  /// @param requestedAmount The amount that is claimed
  /// @param coverPeriod     The cover period
  /// @param coverAsset      The asset in which the payout would be made
  function getAssessmentDepositAndReward(
    uint requestedAmount,
    uint coverPeriod,
    uint coverAsset
  ) public view returns (uint, uint) {

    IPool poolContract = _pool();

    uint nxmPriceInETH = poolContract.getInternalTokenPriceInAsset(0);
    uint nxmPriceInCoverAsset = coverAsset == 0
      ? nxmPriceInETH
      : poolContract.getInternalTokenPriceInAsset(coverAsset);

    uint expectedPayoutInNXM = requestedAmount * ONE_NXM / nxmPriceInCoverAsset;

    // Determine the total rewards that should be minted for the assessors based on cover period
    uint totalRewardInNXM = Math.min(
      MAX_REWARD_IN_NXM,
      expectedPayoutInNXM * REWARD_RATIO * coverPeriod / 365 days / REWARD_DENOMINATOR
    );

    uint dynamicDeposit = totalRewardInNXM * nxmPriceInETH / ONE_NXM;
    uint minDeposit = 1 ether * MIN_ASSESSMENT_DEPOSIT_RATIO / MIN_ASSESSMENT_DEPOSIT_DENOMINATOR;
    uint assessmentDepositInETH = Math.max(minDeposit, dynamicDeposit);

    return (assessmentDepositInETH, totalRewardInNXM);
  }

  /// Returns a Claim aggregated in a human-friendly format.
  ///
  /// @dev This view is meant to be used in user interfaces to get a claim in a format suitable for
  /// displaying all relevant information in as few calls as possible. See ClaimDisplay struct.
  ///
  /// @param id    Claim identifier for which the ClaimDisplay is returned
  function getClaimDisplay(uint id) internal view returns (ClaimDisplay memory) {
    Claim memory claim = claims[id];
    (IAssessment.Poll memory poll,,) = _assessment().assessments(claim.assessmentId);

    ClaimStatus claimStatus = ClaimStatus.PENDING;
    PayoutStatus payoutStatus = PayoutStatus.PENDING;
    {
      // Determine the claims status
      if (block.timestamp >= poll.end) {
        if (poll.accepted > poll.denied) {
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
          uint payoutCooldown = _assessment().getPayoutCooldown();
          if (
            block.timestamp >= poll.end + payoutCooldown + PAYOUT_REDEMPTION_PERIOD
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
      id,
      coverData.productId,
      claim.coverId,
      claim.assessmentId,
      claim.amount,
      assetSymbol,
      claim.coverAsset,
      coverData.start,
      expiration,
      poll.start,
      poll.end,
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

  /* === MUTATIVE FUNCTIONS ==== */

  /// Submits a claim for assessment
  ///
  /// @dev This function requires an ETH assessment fee. See: getAssessmentDepositAndReward
  ///
  /// @param coverId          Cover identifier
  /// @param requestedAmount  The amount expected to be received at payout
  /// @param ipfsMetadata     An IPFS hash that stores metadata about the claim that is emitted as
  ///                         an event. It's required for proof of loss. If this string is empty,
  ///                         no event is emitted.
  function submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    string calldata ipfsMetadata
  ) external payable override onlyMember whenNotPaused returns (Claim memory claim) {
    require(
      coverNFT.isApprovedOrOwner(msg.sender, coverId),
      "Only the owner or approved addresses can submit a claim"
    );
    return _submitClaim(coverId, requestedAmount, ipfsMetadata, msg.sender);
  }

  function _submitClaim(
    uint32 coverId,
    uint96 requestedAmount,
    string calldata ipfsMetadata,
    address owner
  ) internal returns (Claim memory) {

    {
      ClaimSubmission memory previousSubmission = lastClaimSubmissionOnCover[coverId];

      if (previousSubmission.exists) {

        uint80 assessmentId = claims[previousSubmission.claimId].assessmentId;
        IAssessment.Poll memory poll = _assessment().getPoll(assessmentId);
        uint payoutCooldown = _assessment().getPayoutCooldown();

        require(block.timestamp >= poll.end + payoutCooldown, ClaimIsBeingAssessed());
        require(
          poll.accepted <= poll.denied ||
          block.timestamp >= uint(poll.end) + payoutCooldown + PAYOUT_REDEMPTION_PERIOD,
          PayoutCanStillBeRedeemed()
        );
      }

      lastClaimSubmissionOnCover[coverId] = ClaimSubmission(uint80(claims.length), true);
    }

    CoverData memory coverData = _cover().getCoverData(coverId);

    {
      ProductType memory productType = _coverProducts().getProductTypeOf(coverData.productId);
      require(productType.claimMethod == ClaimMethod.IndividualClaims, "Invalid claim method for this product type");
      require(requestedAmount <= coverData.amount, "Covered amount exceeded");
      require(block.timestamp > coverData.start, "Cannot buy cover and submit claim in the same block");
      require(
        uint(coverData.start) + uint(coverData.period) + uint(coverData.gracePeriod) > block.timestamp,
        "Cover is outside the grace period"
      );

      emit ClaimSubmitted(
        owner,              // claim submitter
        claims.length,      // claimId
        coverId,            // coverId
        coverData.productId // user
      );
    }

    (uint assessmentDepositInETH, uint totalRewardInNXM) = getAssessmentDepositAndReward(
      requestedAmount,
      coverData.period,
      coverData.coverAsset
    );

    uint newAssessmentId = _assessment().startAssessment(totalRewardInNXM, assessmentDepositInETH);

    Claim memory claim = Claim({
      assessmentId: SafeUintCast.toUint80(newAssessmentId),
      coverId: coverId,
      segmentId: 0,
      amount: requestedAmount,
      coverAsset: coverData.coverAsset,
      payoutRedeemed: false
    });

    claims.push(claim);

    if (bytes(ipfsMetadata).length > 0) {
      emit MetadataSubmitted(claims.length - 1, ipfsMetadata);
    }

    require(msg.value >= assessmentDepositInETH, "Assessment deposit is insufficient");
    if (msg.value > assessmentDepositInETH) {
      // Refund ETH excess back to the sender
      (
        bool refunded,
        /* bytes data */
      ) = owner.call{value: msg.value - assessmentDepositInETH}("");
      require(refunded, "Assessment deposit excess refund failed");
    }

    // Transfer the assessment deposit to the pool
    (
      bool transferSucceeded,
      /* bytes data */
    ) =  address(_pool()).call{value: assessmentDepositInETH}("");
    require(transferSucceeded, "Assessment deposit transfer to pool failed");

    return claim;
  }

  /// Redeems payouts for accepted claims
  ///
  /// @dev Anyone can call this function, the payout always being transfered to the NFT owner.
  /// When the tokens are transfered the assessment deposit is also sent back.
  ///
  /// @param claimId  Claim identifier
  function redeemClaimPayout(uint104 claimId) external override whenNotPaused {
    Claim memory claim = claims[claimId];
    (
      IAssessment.Poll memory poll,
      /*uint128 totalAssessmentReward*/,
      uint assessmentDepositInETH
    ) = _assessment().assessments(claim.assessmentId);

    require(block.timestamp >= poll.end, "The claim is still being assessed");
    require(poll.accepted > poll.denied, "The claim needs to be accepted");

    uint payoutCooldown = _assessment().getPayoutCooldown();

    require(block.timestamp >= poll.end + payoutCooldown, "The claim is in cooldown period");

    require(
      block.timestamp < uint(poll.end) + payoutCooldown + PAYOUT_REDEMPTION_PERIOD,
      "The redemption period has expired"
    );

    require(!claim.payoutRedeemed, "Payout has already been redeemed");
    claims[claimId].payoutRedeemed = true;

    _ramm().updateTwap();
    address payable coverOwner = payable(_cover().burnStake(
      claim.coverId,
      claim.amount
    ));

    // Send payout in cover asset
    _pool().sendPayout(claim.coverAsset, coverOwner, claim.amount, assessmentDepositInETH);

    emit ClaimPayoutRedeemed(coverOwner, claim.amount, claimId, claim.coverId);
  }

  /// @dev Updates internal contract addresses to the ones stored in master. This function is
  /// automatically called by the master contract when a contract is added or upgraded.
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
    internalContracts[uint(ID.RA)] = master.getLatestAddress("RA");
    internalContracts[uint(ID.CP)] = master.getLatestAddress("CP");
  }
}
