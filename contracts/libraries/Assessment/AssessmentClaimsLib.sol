// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "./AssessmentUtilsLib.sol";

library AssessmentClaimsLib {

  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint16 internal constant PERC_BASIS_POINTS = 10000;

  event ProofSubmitted(uint indexed coverId, address indexed owner, string ipfsHash);

  /**
   *  Submits a claim for assessment
   *
   *  @dev This function requires an ETH submission fee.
   *
   *  @param coverId          Cover identifier
   *  @param requestedAmount  The amount expected to be received at payout
   *  @param withProof        When true, a ProofSubmitted event is emitted with ipfsProofHash.
   *                          When false, no ProofSubmitted event is emitted to save gas if the
   *                          cover wording doesn't enforce a proof of loss.
   *  @param ipfsProofHash    The IPFS hash required for proof of loss. It is ignored if withProof
   *                          is false
   */
  function submitClaim(
    IAssessment.Configuration calldata CONFIG,
    uint24 coverId,
    uint96 requestedAmount,
    bool withProof,
    string calldata ipfsProofHash,
    IAssessment.Claim[] storage claims
  ) external {
    {
      uint submissionDeposit = 1 ether * uint(CONFIG.CLAIM_ASSESSMENT_DEPOSIT_PERC) / uint(PERC_BASIS_POINTS);
      require(msg.value == submissionDeposit, "Submission deposit different that the expected value");
    }
    // [todo] Cover premium and total amount need to be obtained from the cover
    // itself. The premium needs to be converted to NXM using a TWAP at claim time.
    {
      uint96 coverAmount = 1000 ether;
      require(requestedAmount <= coverAmount, "Cannot claim more than the covered amount");
    }
    uint16 coverPeriod = 365;
    uint8 payoutAsset = uint8(IAssessment.Asset.ETH); // take this form cover asset
    //uint80 nxmPriceSnapshot = 147573952589676412928; // 1 NXM ~ 147 DAI
    uint80 nxmPriceSnapshot = uint80(38200000000000000); // 1 NXM ~ 0.0382 ETH


    // a snapshot of CONFIG.CLAIM_ASSESSMENT_DEPOSIT_PERC at submission if it ever changes before redeeming
    if (withProof) {
      emit ProofSubmitted(coverId, msg.sender, ipfsProofHash);
    }

    IAssessment.Claim memory claim = IAssessment.Claim(
      IAssessment.Poll(0, 0, uint32(block.timestamp), 0),
      IAssessment.ClaimDetails(
        requestedAmount,
        coverId,
        coverPeriod,
        payoutAsset,
        nxmPriceSnapshot,
        CONFIG.CLAIM_ASSESSMENT_DEPOSIT_PERC,
        false
      )
    );

    uint payoutImpact = AssessmentUtilsLib._getPayoutImpactOfClaim(claim.details);
    claim.poll.end = AssessmentUtilsLib._calculatePollEndDate(CONFIG, claim.poll, payoutImpact);

    claims.push(claim);
  }

  function redeemClaimPayout (
    IAssessment.Configuration calldata CONFIG,
    IPool pool,
    IMemberRoles memberRoles,
    uint104 id,
    address payable coverOwner,
    IAssessment.Claim[] storage claims,
    mapping(uint => address) storage addressOfAsset
  ) external {
    IAssessment.Claim memory claim = claims[id];
    require(
      AssessmentUtilsLib._getPollStatus(claim.poll) == IAssessment.PollStatus.ACCEPTED,
      "The claim must be accepted"
    );
    require(
      block.timestamp >= AssessmentUtilsLib._getCooldownEndDate(CONFIG, claim.poll.end),
      "The claim is in cooldown period"
    );
    require(!claim.details.payoutRedeemed, "Payout was already redeemed");
    claims[id].details.payoutRedeemed = true;
    // [todo] Destroy and create a new cover nft
    address payable payoutAddress = memberRoles.getClaimPayoutAddress(coverOwner);
    address coverAsset = addressOfAsset[uint(IAssessment.Asset.ETH)]; // [todo]
    bool succeeded = pool.sendClaimPayout(coverAsset, payoutAddress, claim.details.amount);
    require(succeeded, "Claim payout failed");
    uint assessmentDepositToRefund = 1 ether * uint(claim.details.assessmentDepositPerc) /
      uint(PERC_BASIS_POINTS);
    (bool refunded, /* bytes data */) = payoutAddress.call{value: assessmentDepositToRefund}("");
    require(refunded, "Assessment fee refund failed");
  }
}
