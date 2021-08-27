// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IAssessment.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../libraries/Assessment/AssessmentClaimsLib.sol";
import "../../libraries/Assessment/AssessmentGovernanceActionsLib.sol";
import "../../libraries/Assessment/AssessmentIncidentsLib.sol";
import "../../libraries/Assessment/AssessmentVoteLib.sol";

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

  Configuration public config;

  Claim[] public override claims;
  address[] public override claimants;

  /* ========== CONSTRUCTOR ========== */

  constructor(address masterAddress) {
    // [todo] Move to intiialize function
    // The minimum cover premium is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.rewardRatio = 52; // 0.52%
    config.claimAssessmentDepositRatio = 500; // 5% i.e. 0.05 ETH submission flat fee
    master = INXMMaster(masterAddress);
    nxm = INXMToken(master.tokenAddress());
  }

  /* ========== VIEWS ========== */

  function getClaimsCount() external override view returns (uint) {
    return claims.length;
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
    bool hasProof ,
    string calldata ipfsProofHash
  ) external payable override onlyMember {
    {
      require(
        msg.value == 1 ether * uint(config.claimAssessmentDepositRatio) / RATIO_BPS,
        "Submission deposit different than the expected value"
      );
    }
    // [todo] Cover premium and total amount need to be obtained from the cover
    // itself. The premium needs to be converted to NXM using a TWAP at claim time.
    {
      uint96 coverAmount = 1000 ether;
      require(requestedAmount <= coverAmount, "Cannot claim more than the covered amount");
    }

    {
      ICover coverContract = ICover(internalContracts[uint(IMasterAwareV2.ID.CO)]);
      address owner = coverContract.ownerOf(coverId);
      claimants.push(owner);
      coverContract.transferFrom(owner, address(this), coverId);
    }

    if (hasProof) {
      emit ProofSubmitted(coverId, msg.sender, ipfsProofHash);
    }

    uint16 coverPeriod = 365;
    uint8 payoutAsset = 0; // take this form cover asset
    IAssessment.Claim memory claim = IAssessment.Claim(
      requestedAmount,
      coverId,
      coverPeriod,
      payoutAsset,
      config.claimAssessmentDepositRatio,
      false
    );

    {
      // [todo] Get nxmPrice at cover purchase time
      uint80 nxmPrice = uint80(38200000000000000); // 1 NXM ~ 0.0382 ETH

      // Calculate the expected in NXM using the NXM price at cover purchase time
      uint expectedPayoutNXM = claim.amount * PRECISION / nxmPrice;

      // Determine the total rewards that should be minted for the assessors based on cover period
      uint totalReward = expectedPayoutNXM * config.rewardRatio * details.coverPeriod / 365
      / RATIO_BPS;
      uint assessmentId = startAssessment(expectedPayoutNXM, totalRewardNXM);
      claim.assessmentId = uint80(assessmentId);
      claims.push(claim);
    }
  }

  function redeemClaimPayout(uint104 id) external override {
    Claim memory claim = claims[claimId];

    require(
      AssessmentVoteLib._getPollStatus(claim.poll) == IAssessment.PollStatus.ACCEPTED,
      "The claim must be accepted"
    );

    require(
      block.timestamp >= claim.poll.end + config.payoutCooldownDays * 1 days,
      "The claim is in cooldown period"
    );

    require(!claim.details.payoutRedeemed, "Payout has already been redeemed");
    claims[claimId].details.payoutRedeemed = true;

    ICover coverContract = ICover(internalContracts[uint(IMasterAwareV2.ID.CO)]);
    address payable coverOwner = payable(claimants[claim.details.coverId]);
    coverContract.performPayoutBurn(
      claim.details.coverId,
      coverOwner,
      claim.details.amount
    );

    // [todo] Replace asset with payoutAsset
    IPool poolContract = IPool(internalContracts[uint(IMasterAwareV2.ID.P1)]);
    address asset = poolContract.assets(claim.details.payoutAsset);

    // [todo] Replace payoutAddress with the member's address using the member id
    IMemberRoles memberRolesContract = IMemberRoles(internalContracts[uint(IMasterAwareV2.ID.MR)]);
    address payable payoutAddress = memberRolesContract.getClaimPayoutAddress(coverOwner);

    bool succeeded = poolContract.sendClaimPayout(asset, payoutAddress, claim.details.amount);
    require(succeeded, "Claim payout failed");

    {
      uint assessmentDepositToRefund = 1 ether * uint(claim.details.assessmentDepositPerc) / RATIO_BPS;
      (bool refunded, /* bytes data */) = payoutAddress.call{value: assessmentDepositToRefund}("");
      require(refunded, "Submission deposit refund failed");
    }
  }

  // [warn] This function has a critical bug if more than two claims are allowed
  function redeemCoverForDeniedClaim(uint coverId, uint claimId) external override {
    IAssessment.Poll memory poll = claims[claimId].poll;
    require(
      AssessmentVoteLib._getPollStatus(poll) == IAssessment.PollStatus.DENIED,
      "Cover can be redeemed only if the claim is denied"
    );

    ICover coverContract = ICover(internalContracts[uint(IMasterAwareV2.ID.CO)]);

    {
      (,, uint8 deniedClaims,,,) = coverContract.covers(coverId);
      require(deniedClaims == 0, "Cover was already denied twice");
    }

    coverContract.incrementDeniedClaims(coverId);
    coverContract.transferFrom(address(this), claimants[claimId], coverId);
  }

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values)
  external override onlyGovernance {
    config = AssessmentGovernanceActionsLib.getUpdatedUintParameters(config, paramNames, values);
  }

  // [todo] Since this function is called every time contracts change,
  // all internal contracts could be stored here to avoid calls to master when
  // using onlyInternal or simply making a call to another contract.
  // What I have in mind is that every time this function is called, everything should
  // be wiped out and replaced with what is passed as calldata by master. This function
  // should only be callable by master.
  function changeDependentContractAddress() external override {
    master = INXMMaster(master);
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
  }

  // Required to receive NFTS
  function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
  external pure override returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }

}
