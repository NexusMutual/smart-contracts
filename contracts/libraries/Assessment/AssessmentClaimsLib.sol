// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/IMasterAwareV2.sol";
import "../../libraries/Assessment/AssessmentVoteLib.sol";

library AssessmentClaimsLib {

  // Ratios are defined between 0-10000 bps (i.e. double decimal precision percentage)
  uint internal constant RATIO_BPS = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  function _getExpectedClaimPayoutNXM (IAssessment.ClaimDetails memory details)
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
   *  @param hasProof         When true, a ProofSubmitted event is emitted with ipfsProofHash.
   *                          When false, no ProofSubmitted event is emitted to save gas if the
   *                          cover wording doesn't enforce a proof of loss.
   *  @param ipfsProofHash    The IPFS hash required for proof of loss. It is ignored if hasProof
   *                          is false
   */
  function submitClaim(
    IAssessment.Configuration calldata config,
    mapping(uint => address payable) storage internalContracts,
    IAssessment.Claim[] storage claims,
    address[] storage claimants,
    uint24 coverId,
    uint96 requestedAmount,
    bool hasProof,
    string calldata ipfsProofHash
  ) external {
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
    //uint80 nxmPriceSnapshot = 147573952589676412928; // 1 NXM ~ 147 DAI
    uint80 nxmPriceSnapshot = uint80(38200000000000000); // 1 NXM ~ 0.0382 ETH
    IAssessment.ClaimDetails memory claimDetails = IAssessment.ClaimDetails(
      requestedAmount,
      coverId,
      coverPeriod,
      payoutAsset,
      nxmPriceSnapshot,
      config.claimAssessmentDepositRatio,
      false
    );

    {
      IAssessment.Claim memory claim = IAssessment.Claim(
        IAssessment.Poll(0, 0, uint32(block.timestamp), 0),
        claimDetails
      );
      claim.poll.end = claim.poll.start + config.minVotingPeriodDays * 1 days;
      claims.push(claim);
    }
  }

  // [warn] This function has a critical bug if more than two claims are allowed
  function redeemCoverForDeniedClaim(
    IAssessment.Configuration calldata config,
    mapping(uint => address payable) storage internalContracts,
    IAssessment.Claim[] storage claims,
    address[] storage claimants,
    uint coverId,
    uint claimId
  ) external {
    IAssessment.Poll memory poll = claims[claimId].poll;
    require(
      AssessmentVoteLib._getPollStatus(poll) == IAssessment.PollStatus.DENIED,
      "Cover can be redeemed only if the claim is denied"
    );

    ICover coverContract = ICover(internalContracts[uint(IMasterAwareV2.ID.CO)]);

    {
      (,, uint8 deniedClaims,,,) = coverContract.covers(coverId);
      require(deniedClaims == 0, "Cover already has two denied claims");
    }

    coverContract.incrementDeniedClaims(coverId);
    coverContract.transferFrom(address(this), claimants[claimId], coverId);
  }

  function redeemClaimPayout (
    IAssessment.Configuration calldata config,
    mapping(uint => address payable) storage internalContracts,
    IAssessment.Claim[] storage claims,
    address[] storage claimants,
    uint104 claimId
  ) external {
    IAssessment.Claim memory claim = claims[claimId];
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

  event ProofSubmitted(uint indexed coverId, address indexed owner, string ipfsHash);
}
