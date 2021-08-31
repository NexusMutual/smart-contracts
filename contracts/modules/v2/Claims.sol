// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";

import "../../interfaces/INXMToken.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IClaims.sol";
import "../../interfaces/IAssessment.sol";

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

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  /**
   *  Returns a Claim aggregated in a human-friendly format.
   *
   *  @dev This view is meant to be used in user interfaces to get a claim in a format suitable for
   *  displaying all relevant information in as few calls as possible. See ClaimDisplay struct.
   *
   *  @param id    Claim identifier for which the ClaimDisplay is returned
   */
  function getClaimToDisplay (uint id) public view returns (ClaimDisplay memory) {
    Claim memory claim = claims[id];
    IAssessment.Poll memory poll = assessment().assessments(claim.assessmentId);

    string memory claimStatusDisplay;
    string memory payoutStatusDisplay;
    {
      IAssessment.PollStatus claimStatus = AssessmentLib._getPollStatus(poll);
      if (claimStatus == IAssessment.PollStatus.ACCEPTED) {
        claimStatusDisplay = "Accepted";
      } else if (claimStatus == IAssessment.PollStatus.DENIED) {
        claimStatusDisplay = "Denied";
      } else if (claimStatus == IAssessment.PollStatus.PENDING) {
        claimStatusDisplay = "Pending";
      }

      if (claimStatus == IAssessment.PollStatus.DENIED) {
        payoutStatusDisplay = "Denied";
      } else if (claimStatus == IAssessment.PollStatus.ACCEPTED && claim.payoutRedeemed) {
        payoutStatusDisplay = "Complete";
      } else {
        payoutStatusDisplay = "Pending";
      }
    }

    // [todo] Get from covers contract
    uint coverStart = block.timestamp;
    uint coverPeriod = 365;
    uint coverEnd = coverStart + coverPeriod * 1 days;
    uint productId = 1;

    string memory assetSymbol;
    if (claim.payoutAsset == 0) {
      assetSymbol = "ETH";
    } else {
      // [todo] Assuming it's an ERC20, get this by calling the ERC contract direcly
      assetSymbol = "DAI";
    }

    return ClaimDisplay(
      id,
      productId,
      claim.coverId,
      claim.amount,
      assetSymbol,
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
   *  @param from  First claim identifier from the requested range
   *  @param to    Last claim identifier from the requested range
   */
  function getClaimsToDisplay (uint104 from, uint104 to)
  external view returns (ClaimDisplay[] memory) {
    ClaimDisplay[] memory claimDisplays = new ClaimDisplay[](to-from+1);
    for (uint104 id = from; id <= to; id++) {
      claimDisplays[id - from] = getClaimToDisplay(id);
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
    Claim memory claim = Claim(
      0,
      requestedAmount,
      coverId,
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
      uint totalReward = expectedPayoutNXM * config.rewardRatio * coverPeriod / 365
      / RATIO_BPS;
      uint assessmentId = assessment().startAssessment(totalReward);
      claim.assessmentId = uint80(assessmentId);
      claims.push(claim);
    }
  }

  function redeemClaimPayout(uint104 claimId) external override {
    Claim memory claim = claims[claimId];
    IAssessment.Poll memory poll = assessment().assessments(claim.assessmentId);

    require(
      AssessmentLib._getPollStatus(poll) == IAssessment.PollStatus.ACCEPTED,
      "The claim must be accepted"
    );

    (,,uint8 payoutCooldownDays) = assessment().config();
    require(
      block.timestamp >= poll.end + payoutCooldownDays * 1 days,
      "The claim is in cooldown period"
    );

    require(!claim.payoutRedeemed, "Payout has already been redeemed");
    claims[claimId].payoutRedeemed = true;

    ICover coverContract = ICover(internalContracts[uint(IMasterAwareV2.ID.CO)]);
    address payable coverOwner = payable(claimants[claim.coverId]);
    coverContract.performPayoutBurn(
      claim.coverId,
      coverOwner,
      claim.amount
    );

    // [todo] Replace asset with payoutAsset
    IPool poolContract = IPool(internalContracts[uint(IMasterAwareV2.ID.P1)]);
    address asset = poolContract.assets(claim.payoutAsset);

    // [todo] Replace payoutAddress with the member's address using the member id
    IMemberRoles memberRolesContract = IMemberRoles(internalContracts[uint(IMasterAwareV2.ID.MR)]);
    address payable payoutAddress = memberRolesContract.getClaimPayoutAddress(coverOwner);

    bool succeeded = poolContract.sendClaimPayout(asset, payoutAddress, claim.amount);
    require(succeeded, "Claim payout failed");

    {
      uint assessmentDepositToRefund = 1 ether * uint(claim.assessmentDepositRatio) / RATIO_BPS;
      (bool refunded, /* bytes data */) = payoutAddress.call{value: assessmentDepositToRefund}("");
      require(refunded, "Submission deposit refund failed");
    }
  }

  // [warn] This function has a critical bug if more than two claims are allowed
  function redeemCoverForDeniedClaim(uint coverId, uint claimId) external override {
    Claim memory claim = claims[claimId].assessmentId;

    IAssessment.Poll memory poll = assessment().assessments(claim.assessmentId);

    require(
      AssessmentLib._getPollStatus(poll) == IAssessment.PollStatus.DENIED,
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
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == IAssessment.UintParams.rewardRatio) {
        newConfig.rewardRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.claimAssessmentDepositRatio) {
        newConfig.claimAssessmentDepositRatio = uint16(values[i]);
        continue;
      }
    }
    config = newConfig;
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
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
  }

  // Required to receive NFTS
  function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
  external pure override returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }

}
