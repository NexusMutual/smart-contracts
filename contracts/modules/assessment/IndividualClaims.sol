// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/IIndividualClaims.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

/// Provides a way for cover owners to submit claims and redeem payouts. It is an entry point to
/// the assessment process where the members of the mutual decide the outcome of claims.
contract IndividualClaims is IIndividualClaims, MasterAwareV2 {

  // 0-10000 bps (i.e. double decimal precision percentage)
  uint internal constant MIN_ASSESSMENT_DEPOSIT_DENOMINATOR = 10000;
  uint internal constant REWARD_DENOMINATOR = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  INXMToken public immutable nxm;
  ICoverNFT public immutable coverNFT;

  /* ========== STATE VARIABLES ========== */

  Configuration public override config;

  Claim[] public override claims;

  // Mapping from coverId to claimId used to check if a new claim can be submitted on the given
  // cover as long as the last submitted claim reached a final state.
  mapping(uint => ClaimSubmission) public lastClaimSubmissionOnCover;

  /* ========== CONSTRUCTOR ========== */

  constructor(address nxmAddress, address coverNFTAddress) {
    nxm = INXMToken(nxmAddress);
    coverNFT = ICoverNFT(coverNFTAddress);
  }

  /* ========== VIEWS ========== */

  function cover() internal view returns (ICover) {
    return ICover(getInternalContractAddress(ID.CO));
  }

  function coverProducts() internal view returns (ICoverProducts) {
    return ICoverProducts(getInternalContractAddress(ID.CP));
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  function pool() internal view returns (IPool) {
    return IPool(getInternalContractAddress(ID.P1));
  }

  function getClaimsCount() external override view returns (uint) {
    return claims.length;
  }

  /// Returns the required assessment deposit and total reward for a new claim
  ///
  /// @dev This view is meant to be used either by users or user interfaces to determine the
  /// minimum assessment deposit value of the submitClaim tx.
  ///
  /// @param requestedAmount  The amount that is claimed
  /// @param segmentPeriod    The cover period of the segment in days
  /// @param coverAsset      The asset in which the payout would be made
  function getAssessmentDepositAndReward(
    uint requestedAmount,
    uint segmentPeriod,
    uint coverAsset
  ) public view returns (uint, uint) {
    IPool poolContract = pool();
    uint nxmPriceInETH = poolContract.getTokenPriceInAsset(0);
    uint nxmPriceInCoverAsset = coverAsset == 0
      ? nxmPriceInETH
      : poolContract.getTokenPriceInAsset(coverAsset);

    // Calculate the expected payout in NXM using the NXM price at cover purchase time
    uint expectedPayoutInNXM = requestedAmount * PRECISION / nxmPriceInCoverAsset;

    // Determine the total rewards that should be minted for the assessors based on cover period
    uint totalRewardInNXM = Math.min(
      uint(config.maxRewardInNXMWad) * PRECISION,
      expectedPayoutInNXM * uint(config.rewardRatio) * segmentPeriod / 365 days / REWARD_DENOMINATOR
    );

    uint dynamicDeposit = totalRewardInNXM * nxmPriceInETH / PRECISION;
    uint minDeposit = 1 ether * uint(config.minAssessmentDepositRatio) /
      MIN_ASSESSMENT_DEPOSIT_DENOMINATOR;

    // If dynamicDeposit falls below minDeposit use minDeposit instead
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
    (IAssessment.Poll memory poll,,) = assessment().assessments(claim.assessmentId);

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
          (,,uint8 payoutCooldownInDays,) = assessment().config();
          if (
            block.timestamp >= poll.end +
            uint(payoutCooldownInDays) * 1 days +
            uint(config.payoutRedemptionPeriodInDays) * 1 days
          ) {
            payoutStatus = PayoutStatus.UNCLAIMED;
          }
        }
      } else if (claimStatus == ClaimStatus.DENIED) {
        payoutStatus = PayoutStatus.DENIED;
      }
    }

    CoverData memory coverData = cover().coverData(claim.coverId);

    CoverSegment memory segment = cover().coverSegmentWithRemainingAmount(claim.coverId, claim.segmentId);

    uint segmentEnd = segment.start + segment.period;

    string memory assetSymbol;
    if (claim.coverAsset == 0) {
      assetSymbol = "ETH";
    } else {

      address assetAddress = pool().getAsset(claim.coverAsset).assetAddress;
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
      segment.start,
      segmentEnd,
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
    uint16 segmentId,
    uint96 requestedAmount,
    string calldata ipfsMetadata
  ) external payable override onlyMember whenNotPaused returns (Claim memory claim) {
    require(
      coverNFT.isApprovedOrOwner(msg.sender, coverId),
      "Only the owner or approved addresses can submit a claim"
    );
    return _submitClaim(coverId, segmentId, requestedAmount, ipfsMetadata, msg.sender);
  }

  function submitClaimFor(
    uint32 coverId,
    uint16 segmentId,
    uint96 requestedAmount,
    string calldata ipfsMetadata,
    address owner
  ) external payable override onlyInternal whenNotPaused returns (Claim memory claim){
    return _submitClaim(coverId, segmentId, requestedAmount, ipfsMetadata, owner);
  }

  function _submitClaim(
    uint32 coverId,
    uint16 segmentId,
    uint96 requestedAmount,
    string calldata ipfsMetadata,
    address owner
  ) internal returns (Claim memory) {
    {
      ClaimSubmission memory previousSubmission = lastClaimSubmissionOnCover[coverId];
      if (previousSubmission.exists) {
        uint80 assessmentId = claims[previousSubmission.claimId].assessmentId;
        IAssessment.Poll memory poll = assessment().getPoll(assessmentId);
        (,,uint8 payoutCooldownInDays,) = assessment().config();
        uint payoutCooldown = uint(payoutCooldownInDays) * 1 days;
        if (block.timestamp >= poll.end + payoutCooldown) {
          if (
            poll.accepted > poll.denied &&
            block.timestamp < uint(poll.end) +
            payoutCooldown +
            uint(config.payoutRedemptionPeriodInDays) * 1 days
          ) {
            revert("A payout can still be redeemed");
          }
        } else {
          revert("A claim is already being assessed");
        }
      }
      lastClaimSubmissionOnCover[coverId] = ClaimSubmission(uint80(claims.length), true);
    }

    ICoverProducts coverProductsContract = coverProducts();
    CoverData memory coverData = cover().coverData(coverId);
    CoverSegment memory segment = cover().coverSegmentWithRemainingAmount(coverId, segmentId);

    {
      Product memory product = coverProductsContract.products(coverData.productId);
      ProductType memory productType = coverProductsContract.productTypes(product.productType);

      require(
        productType.claimMethod == uint8(ClaimMethod.IndividualClaims),
        "Invalid claim method for this product type"
      );
      require(requestedAmount <= segment.amount, "Covered amount exceeded");
      require(block.timestamp > segment.start, "Cannot buy cover and submit claim in the same block");
      require(
        uint(segment.start) + uint(segment.period) + uint(segment.gracePeriod) > block.timestamp,
        "Cover is outside the grace period"
      );

      emit ClaimSubmitted(
        owner,         // user
        claims.length,      // claimId
        coverId,            // coverId
        coverData.productId // user
      );
    }

    (uint assessmentDepositInETH, uint totalRewardInNXM) = getAssessmentDepositAndReward(
      requestedAmount,
      segment.period,
      coverData.coverAsset
    );

    uint newAssessmentId = assessment().startAssessment(totalRewardInNXM, assessmentDepositInETH);

    Claim memory claim = Claim({
      assessmentId: SafeUintCast.toUint80(newAssessmentId),
      coverId: coverId,
      segmentId: segmentId,
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
    ) =  getInternalContractAddress(ID.P1).call{value: assessmentDepositInETH}("");
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
    ) = assessment().assessments(claim.assessmentId);

    require(block.timestamp >= poll.end, "The claim is still being assessed");
    require(poll.accepted > poll.denied, "The claim needs to be accepted");

    (,,uint8 payoutCooldownInDays,) = assessment().config();
    uint payoutCooldown = uint(payoutCooldownInDays) * 1 days;

    require(block.timestamp >= poll.end + payoutCooldown, "The claim is in cooldown period");

    require(
      block.timestamp < uint(poll.end) + payoutCooldown + uint(config.payoutRedemptionPeriodInDays) * 1 days,
      "The redemption period has expired"
    );

    require(!claim.payoutRedeemed, "Payout has already been redeemed");
    claims[claimId].payoutRedeemed = true;

    address payable coverOwner = payable(cover().burnStake(
      claim.coverId,
      claim.segmentId,
      claim.amount
    ));

    IPool poolContract = pool();
    if (claim.coverAsset == 0 /* ETH */) {
      // Send payout and deposit in ETH
      poolContract.sendPayout(
        claim.coverAsset,
        coverOwner,
        claim.amount + assessmentDepositInETH
      );
    } else {
      // Send deposit in ETH
      poolContract.sendPayout(0 /* ETH */, coverOwner, assessmentDepositInETH);
      // Send payout in cover asset
      poolContract.sendPayout(claim.coverAsset, coverOwner, claim.amount);
    }

    emit ClaimPayoutRedeemed(coverOwner, claim.amount, claimId, claim.coverId);
  }

  /// Updates configurable aprameters through governance
  ///
  /// @param paramNames  An array of elements from UintParams enum
  /// @param values      An array of the new values, each one corresponding to the parameter
  ///                    from paramNames on the same position.
  function updateUintParameters(
    UintParams[] calldata paramNames,
    uint[] calldata values
  ) external override onlyGovernance {
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == UintParams.payoutRedemptionPeriodInDays) {
        newConfig.payoutRedemptionPeriodInDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.rewardRatio) {
        newConfig.rewardRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.maxRewardInNXMWad) {
        newConfig.maxRewardInNXMWad = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.minAssessmentDepositRatio) {
        newConfig.minAssessmentDepositRatio = uint16(values[i]);
        continue;
      }
    }
    config = newConfig;
  }

  /// @dev Updates internal contract addresses to the ones stored in master. This function is
  /// automatically called by the master contract when a contract is added or upgraded.
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
    internalContracts[uint(ID.CP)] = master.getLatestAddress("CP");

    Configuration memory currentConfig = config;
    bool notInitialized = bytes32(
      abi.encodePacked(
        currentConfig.rewardRatio,
        currentConfig.maxRewardInNXMWad,
        currentConfig.minAssessmentDepositRatio,
        currentConfig.payoutRedemptionPeriodInDays
      )
    ) == bytes32(0);

    if (notInitialized) {
      // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
      config.rewardRatio = 130; // 1.3%
      config.maxRewardInNXMWad = 50; // 50 NXM
      config.minAssessmentDepositRatio = 500; // 5% i.e. 0.05 ETH assessment minimum flat fee
      config.payoutRedemptionPeriodInDays = 30; // days to redeem the payout
    }
  }
}
