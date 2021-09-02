// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";

import "../../interfaces/INXMToken.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IClaims.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/IERC20Detailed.sol";

import "../../libraries/AssessmentLib.sol";

import "../../abstract/MasterAwareV2.sol";

/**
 *  Provides a way for cover owners to submit claims and redeem the payouts and facilitates
 *  assessment processes where members decide the outcome of the events that lead to potential
 *  payouts.
 */
contract Claims is IClaims, MasterAwareV2 {

  // Ratios are defined between 0-10000 bps (i.e. double decimal precision percentage)
  uint internal constant RATIO_BPS = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;


  /* ========== STATE VARIABLES ========== */

  INXMToken internal immutable nxm;

  Configuration public override config;

  Claim[] public override claims;
  address[] public override claimants;

  /* ========== CONSTRUCTOR ========== */

  constructor(address nxmAddress) {
    nxm = INXMToken(nxmAddress);
  }

  function initialize(address masterAddress) external {
    // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.rewardRatio = 52; // 0.52%
    config.assessmentBaseDepositRatio = 500; // 5% i.e. 0.05 ETH submission flat fee
    master = INXMMaster(masterAddress);
  }

  /* ========== VIEWS ========== */

  function cover() internal view returns (ICover) {
    return ICover(getInternalContractAddress(ID.CO));
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

  /**
   *  Returns a Claim aggregated in a human-friendly format.
   *
   *  @dev This view is meant to be used in user interfaces to get a claim in a format suitable for
   *  displaying all relevant information in as few calls as possible. See ClaimDisplay struct.
   *
   *  @param id    Claim identifier for which the ClaimDisplay is returned
   */
  function getClaimDisplay (uint id) public view returns (ClaimDisplay memory) {
    Claim memory claim = claims[id];
    (IAssessment.Poll memory poll,,) = assessment().assessments(claim.assessmentId);

    string memory claimStatusDisplay;
    string memory payoutStatusDisplay;
    {
      IAssessment.PollStatus claimStatus = AssessmentLib._getPollStatus(poll);
      if (claimStatus == IAssessment.PollStatus.ACCEPTED) {
        claimStatusDisplay = "Accepted";
        if (claimStatus == IAssessment.PollStatus.ACCEPTED && claim.redeemed) {
          payoutStatusDisplay = "Complete";
        } else {
          payoutStatusDisplay = "Pending";
        }
      } else if (claimStatus == IAssessment.PollStatus.DENIED) {
        claimStatusDisplay = "Denied";
      } else if (claimStatus == IAssessment.PollStatus.PENDING) {
        claimStatusDisplay = "Pending";
      }
    }

    (
      uint24 productId,
      /*uint96 amount*/,
      uint32 coverStart,
      uint32 coverPeriod,
      uint8 payoutAsset,
      uint8 deniedClaims,
      uint80 nxmPrice
    ) = cover().covers(claim.coverId);

    uint coverEnd = coverStart + coverPeriod;

    string memory assetSymbol;
    if (claim.payoutAsset == 0) {
      assetSymbol = "ETH";
    } else {
      try IERC20Detailed(pool().assets(claim.payoutAsset)).symbol() returns (string memory v) {
        assetSymbol = v;
      } catch {
        // return assetSymbol as an empty string and use claim.payoutAsset instead in the UI
      }
    }

    return ClaimDisplay(
      id,
      productId,
      claim.coverId,
      claim.amount,
      assetSymbol,
      claim.payoutAsset,
      coverStart,
      coverEnd,
      poll.start,
      poll.end,
      claimStatusDisplay,
      payoutStatusDisplay
    );
  }

  /**
   *  Returns an array of claims aggregated in a human-friendly format.
   *
   *  @dev This view is meant to be used in user interfaces to get claims in a format suitable for
   *  displaying all relevant information in as few calls as possible. It can be used to paginate
   *  claims by providing the following paramterers:
   *
   *  @param ids   Array of Claim ids which are returned as ClaimDisplay
   */
  function getClaimsToDisplay (uint104[] calldata ids)
  external view returns (ClaimDisplay[] memory) {
    ClaimDisplay[] memory claimDisplays = new ClaimDisplay[](ids.length);
    for (uint i = 0; i < ids.length; i++) {
      uint104 id = ids[i];
      claimDisplays[i] = getClaimDisplay(id);
    }
    return claimDisplays;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /**
   *  Submits a claim for assessment
   *
   *  @dev This function requires an ETH submission fee. See: _getSubmissionFee()
   *
   *  @param coverId          Cover identifier
   *  @param requestedAmount  The amount expected to be received at payout
   *  @param hasProof         When true, a ProofSubmitted event is emitted with ipfsProofHash.
   *                          When false, no ProofSubmitted event is emitted to save gas if the
   *                          cover wording doesn't enforce a proof of loss.
   *  @param ipfsProofHash    The IPFS hash required for proof of loss. It is ignored if hasProof
   *                          is false
   */
  function submitClaim(
    uint24 coverId,
    uint96 requestedAmount,
    bool hasProof,
    string calldata ipfsProofHash
  ) external payable override onlyMember {
    uint32 coverStart;
    uint32 coverPeriod;
    uint8 payoutAsset;
    uint80 nxmPrice;
    {
      uint96 coverAmount;
      (
        /*uint24 productId*/,
        coverAmount,
        coverStart,
        coverPeriod,
        payoutAsset,
        /*uint8 deniedClaims*/,
        nxmPrice
      ) = cover().covers(coverId);
      require(requestedAmount <= coverAmount, "Cannot claim more than the covered amount");
    }

    {
      address owner = cover().ownerOf(coverId);
      claimants.push(owner);
      cover().transferFrom(owner, address(this), coverId);
    }

    if (hasProof) {
      emit ProofSubmitted(coverId, msg.sender, ipfsProofHash);
    }

    Claim memory claim = Claim(
      0,
      coverId,
      requestedAmount,
      payoutAsset,
      config.assessmentBaseDepositRatio,
      false
    );

    // Calculate the expected in NXM using the NXM price at cover purchase time
    uint expectedPayoutNXM = claim.amount * PRECISION / nxmPrice;

    // Determine the total rewards that should be minted for the assessors based on cover period
    uint totalReward = expectedPayoutNXM * config.rewardRatio * coverPeriod / 365 days
    / RATIO_BPS;

    // [todo] Find out which price to use
    uint dynamicDeposit;
    if (payoutAsset > 0) {
      // If the payout asset is an ERC20 use the currentNxmPrice in that asset
      uint currentNxmPrice = pool().getTokenPrice(payoutAsset);
      dynamicDeposit = totalReward * currentNxmPrice / PRECISION;
    } else {
      // If the payout asset is ETH use the nxmPrice at the time of cover purchase
      dynamicDeposit = totalReward * nxmPrice / PRECISION;
    }

    uint baseDeposit = 1 ether * config.assessmentBaseDepositRatio / RATIO_BPS;
    uint deposit = baseDeposit + dynamicDeposit;

    require(
      msg.value == deposit,
      "Assessment deposit different than the expected value"
    );

    uint assessmentId = assessment().startAssessment(totalReward, deposit);
    claim.assessmentId = uint80(assessmentId);
    claims.push(claim);
  }

  function redeemClaimPayout(uint104 claimId) external override {
    Claim memory claim = claims[claimId];
    (
      IAssessment.Poll memory poll,
      /*uint128 totalAssessmentReward*/,
      uint assessmentDeposit
    ) = assessment().assessments(claim.assessmentId);

    require(
      AssessmentLib._getPollStatus(poll) == IAssessment.PollStatus.ACCEPTED,
      "The claim must be accepted"
    );

    (,,uint8 payoutCooldownDays) = assessment().config();
    require(
      block.timestamp >= poll.end + payoutCooldownDays * 1 days,
      "The claim is in cooldown period"
    );

    require(!claim.redeemed, "Payout has already been redeemed");
    claims[claimId].redeemed = true;

    address payable coverOwner = payable(claimants[claim.coverId]);
    cover().performPayoutBurn(
      claim.coverId,
      coverOwner,
      claim.amount
    );

    // [todo] Replace payoutAddress with the member's address using the member id
    IMemberRoles memberRolesContract = IMemberRoles(internalContracts[uint(IMasterAwareV2.ID.MR)]);
    address payable payoutAddress = memberRolesContract.getClaimPayoutAddress(coverOwner);

    bool succeeded = pool().sendClaimPayout(claim.payoutAsset, payoutAddress, claim.amount);
    require(succeeded, "Claim payout failed");

    {
      uint assessmentDepositToRefund = 1 ether * uint(claim.assessmentBaseDepositRatio) / RATIO_BPS;
      (bool refunded, /* bytes data */) = payoutAddress.call{value: assessmentDepositToRefund}("");
      require(refunded, "Submission deposit refund failed");
    }
  }

  function redeemCoverForDeniedClaim(uint claimId) external override {
    Claim memory claim = claims[claimId];

    (
      IAssessment.Poll memory poll,
      /*uint128 totalReward*/,
      uint128 assessmentDeposit
    ) = assessment().assessments(claim.assessmentId);

    require(
      AssessmentLib._getPollStatus(poll) == IAssessment.PollStatus.DENIED,
      "Cover can be redeemed only if the claim is denied"
    );

    require(!claim.redeeemed, "Cover was already redeemed");

    (,,uint8 payoutCooldownDays) = assessment().config();
    require(
      block.timestamp >= poll.end + payoutCooldownDays * 1 days,
      "The claim is in cooldown period"
    );

    cover().transferFrom(address(this), claimants[claimId], claim.coverId);
    claims[claimId].redeemed = true;
    getInternalContractAddress(ID.P1).call{value: assessmentDeposit}("");
  }

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values)
  external override onlyGovernance {
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == UintParams.rewardRatio) {
        newConfig.rewardRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.assessmentBaseDepositRatio) {
        newConfig.assessmentBaseDepositRatio = uint16(values[i]);
        continue;
      }
    }
    config = newConfig;
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
  }

  // Required to receive NFTS
  function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
  external pure override returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }

}
