// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "../../libraries/Assessment/AssessmentVoteLib.sol";

library AssessmentClaimsLib {

  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint internal constant PERC_BASIS_POINTS = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  function _getPayoutImpactOfClaim (IAssessment.ClaimDetails memory details)
  internal pure returns (uint) {
    return details.amount * PRECISION / details.nxmPriceSnapshot;
  }

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
      uint submissionDeposit = 1 ether * uint(CONFIG.CLAIM_ASSESSMENT_DEPOSIT_PERC) / PERC_BASIS_POINTS;
      require(msg.value == submissionDeposit, "Submission deposit different that the expected value");
    }
    // [todo] Cover premium and total amount need to be obtained from the cover
    // itself. The premium needs to be converted to NXM using a TWAP at claim time.
    {
      uint96 coverAmount = 1000 ether;
      require(requestedAmount <= coverAmount, "Cannot claim more than the covered amount");
    }
    uint16 coverPeriod = 365;
    uint8 payoutAsset = 0; // take this form cover asset
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

    claim.poll.end = claim.poll.start + CONFIG.MIN_VOTING_PERIOD_DAYS * 1 days;

    claims.push(claim);
  }

  function redeemClaimPayout (
    IAssessment.Configuration calldata CONFIG,
    IPool pool,
    IMemberRoles memberRoles,
    uint104 id,
    IAssessment.Claim[] storage claims,
    mapping(uint => address) storage addressOfAsset
  ) external {
    IAssessment.Claim memory claim = claims[id];
    require(
      AssessmentVoteLib._getPollStatus(claim.poll) == IAssessment.PollStatus.ACCEPTED,
      "The claim must be accepted"
    );
    require(
      block.timestamp >= claim.poll.end + CONFIG.PAYOUT_COOLDOWN_DAYS * 1 days,
      "The claim is in cooldown period"
    );
    address payable coverOwner = payable(0x0000000000000000000000000000000000000000); // [todo]
    require(!claim.details.payoutRedeemed, "Payout was already redeemed");
    claims[id].details.payoutRedeemed = true;
    // [todo] Destroy and create a new cover nft
    address payable payoutAddress = memberRoles.getClaimPayoutAddress(coverOwner);
    address coverAsset = addressOfAsset[0]; // [todo]
    bool succeeded = pool.sendClaimPayout(coverAsset, payoutAddress, claim.details.amount);
    require(succeeded, "Claim payout failed");
    uint assessmentDepositToRefund = 1 ether * uint(claim.details.assessmentDepositPerc) / PERC_BASIS_POINTS;
    (bool refunded, /* bytes data */) = payoutAddress.call{value: assessmentDepositToRefund}("");
    require(refunded, "Assessment fee refund failed");
  }

  event ProofSubmitted(uint indexed coverId, address indexed owner, string ipfsHash);
}
