// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/cryptography/MerkleProof.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "../../abstract/MasterAwareV2.sol";
import "hardhat/console.sol";

/**
 *  Provides a way for cover owners to submit claims and redeem the payouts and facilitates
 *  assessment processes where members decide the outcome of the events that lead to potential
 *  payouts.
 */
contract Assessment is IAssessment, MasterAwareV2 {
  /* ========== CONSTRUCTOR ========== */

  constructor (address dai, address eth) {
    // [todo] Move to intiialize function
    // The minimum cover premium is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    CONFIG.REWARD_PERC = 52;

    CONFIG.INCIDENT_IMPACT_ESTIMATE_PERC = 30; // 30%
    CONFIG.MIN_VOTING_PERIOD_DAYS = 3; // days
    CONFIG.MAX_VOTING_PERIOD_DAYS = 30; // days
    CONFIG.PAYOUT_COOLDOWN_DAYS = 1; //days
    CONFIG.CLAIM_ASSESSMENT_DEPOSIT_PERC = 500; // 5% i.e. 0.05 ETH submission flat fee
    CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC = 0;
    addressOfAsset[uint(Asset.ETH)] = eth;
    addressOfAsset[uint(Asset.DAI)] = dai; // [todo]

    nxm = INXMToken(master.tokenAddress());
  }

  /* ========== STATE VARIABLES ========== */

  INXMToken internal nxm;

  Configuration public CONFIG;

  // ERC20 addresses of supported payout assetss (See Asset enum)
  mapping(uint => address) internal addressOfAsset;

  // Stake states of users. (See Stake struct)
  mapping(address => Stake) public override stakeOf;

  // Votes of users. (See Vote struct)
  mapping(address => Vote[]) public override votesOf;

  // Mapping used to determine if a user has already voted, using a vote hash as a key
  mapping(bytes32 => bool) public override hasAlreadyVotedOn;

  // An array of merkle tree roots used to indicate fraudulent assessors. Each root represents a
  // fraud attempt by one or multiple addresses. Once the root is submitted by adivsory board
  // members through governance, burnFraud uses this root to burn the fraudulent assessors' stakes
  // and correct the outcome of the poll.
  bytes32[] internal fraudMerkleRoots;
  mapping(uint8 => mapping(uint104 => Poll)) internal pollFraudOfEvent;

  Claim[] public override claims;

  Incident[] public override incidents;
  mapping(uint104 => address) internal incidentProponent;
  mapping(uint104 => AffectedToken) internal tokenAffectedByIncident;

  /* ========== VIEWS ========== */

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(getInternalContractAddress(ID.TC));
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(getInternalContractAddress(ID.MR));
  }

  function pool() internal view returns (IPool) {
    return IPool(getInternalContractAddress(ID.P1));
  }

  function getVoteCountOfAssessor(address assessor) external override view returns (uint) {
    return votesOf[assessor].length;
  }

  function getClaimsCount() external override view returns (uint) {
    return claims.length;
  }

  function getIncidentsCount() external override view returns (uint) {
    return incidents.length;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /**
   *  Submits a claim for assessment
   *
   *  @dev This function requires an ETH submission fee. See: _getSubmissionFee()
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
    uint24 coverId,
    uint96 requestedAmount,
    bool withProof,
    string calldata ipfsProofHash
  ) external payable onlyMember {
    AssessmentClaimsLib.submitClaim(
      CONFIG,
      coverId,
      requestedAmount,
      withProof,
      ipfsProofHash,
      claims
    );

  }

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external {
    (
      AffectedToken memory affectedToken,
      Incident memory incident
    ) = AssessmentIncidentsLib.getIncidentToSubmit(
      CONFIG,
      nxm,
      memberRoles(),
      productId,
      priceBefore,
      date
    );

    AssessmentIncidentsLib.saveIncident (
      incident,
      incidents,
      affectedToken,
      tokenAffectedByIncident,
      incidentProponent
    );
  }

  function depositStake (uint96 amount) external onlyMember {
    Stake storage stake = stakeOf[msg.sender];
    stake.amount += amount;
    nxm.transferFrom(msg.sender, address(this), amount);
  }

  function withdrawReward (address user, uint104 untilIndex) external {
    AssessmentVoteLib.withdrawReward(
      CONFIG,
      nxm,
      user,
      untilIndex,
      stakeOf,
      votesOf,
      claims,
      incidents
    );
  }

  function withdrawStake (uint96 amount) external onlyMember {
    AssessmentVoteLib.withdrawStake(CONFIG, nxm, stakeOf, votesOf, amount);
  }

  function redeemClaimPayout (uint104 id, address payable coverOwner) external {
    AssessmentClaimsLib.redeemClaimPayout(
      CONFIG,
      pool(),
      memberRoles(),
      id,
      coverOwner,
      claims,
      addressOfAsset
    );
  }

  function redeemIncidentPayout (uint104 incidentId, uint32 coverId, uint payoutAmount) external {
    AssessmentIncidentsLib.redeemIncidentPayout(
      pool(),
      memberRoles(),
      incidents[incidentId],
      coverId,
      payoutAmount,
      addressOfAsset
    );
  }

  // [todo] Check how many times poll is loaded from storage
  function castVote (uint8 eventType, uint104 id, bool accepted) external onlyMember {
    AssessmentVoteLib.castVote(
    CONFIG,
    eventType,
    id,
    accepted,
    stakeOf,
    votesOf,
    hasAlreadyVotedOn,
    claims,
    incidents
    );
  }

  function submitFraud (bytes32 root) external onlyGovernance {
    fraudMerkleRoots.push(root);
  }

  function burnFraud (
    uint256 rootIndex,
    bytes32[] calldata proof,
    address fraudulentAssessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize
  ) external {
    require(AssessmentGovernanceActionsLib.isFraudProofValid(
      fraudMerkleRoots[rootIndex],
      proof,
      fraudulentAssessor,
      lastFraudulentVoteIndex,
      burnAmount,
      fraudCount
    ), "Invalid merkle proof");

    AssessmentGovernanceActionsLib.processFraudResolution(
      CONFIG,
      lastFraudulentVoteIndex,
      burnAmount,
      fraudCount,
      voteBatchSize,
      fraudulentAssessor,
      stakeOf,
      votesOf,
      pollFraudOfEvent,
      claims,
      incidents
    );
  }

  function updateUintParameters (UintParams[] calldata paramNames, uint[] calldata values)
  external onlyGovernance {
    CONFIG = AssessmentGovernanceActionsLib.updateUintParameters(CONFIG, paramNames, values);
  }

  // [todo] Since this function is called every time contracts change,
  // all internal contracts could be stored here to avoid calls to master when
  // using onlyInternal or simply making a call to another contract.
  // What I have in mind is that every time this function is called, everything should
  // be wiped out and replaced with what is passed as calldata by master. This function
  // should only be callable by master.
  function changeDependentContractAddress() external override {
    INXMMaster master = INXMMaster(master);
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
  }

}

library AssessmentUtilsLib {
  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint16 internal constant PERC_BASIS_POINTS = 10000;

  function abs(int x) internal pure returns (int) {
    return x >= 0 ? x : -x;
  }

  function min(uint a, uint b) internal pure returns (uint) {
    return a <= b ? a : b;
  }

  function pollFraudExists(IAssessment.Poll memory poll) internal pure returns (bool) {
    return poll.start > 0;
  }

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  function _getPollStatus(IAssessment.Poll memory poll) internal view returns (IAssessment.PollStatus) {
    if (block.timestamp < poll.end) {
      return IAssessment.PollStatus.PENDING;
    }

    if (poll.accepted > poll.denied) {
      return IAssessment.PollStatus.ACCEPTED;
    } else {
      return IAssessment.PollStatus.DENIED;
    }
  }

  function _getPayoutImpactOfClaim (IAssessment.Claim memory claim) internal pure returns (uint) {
    return claim.details.amount * PRECISION / claim.details.nxmPriceSnapshot;
  }

  function _getVoteLockupEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Vote memory vote
   ) internal pure returns (uint) {
    return vote.timestamp + CONFIG.MAX_VOTING_PERIOD_DAYS + CONFIG.PAYOUT_COOLDOWN_DAYS;
  }

  function _getCooldownEndDate (
    IAssessment.Configuration calldata CONFIG,
    uint32 pollEnd
  ) internal pure returns (uint32) {
    return pollEnd + CONFIG.PAYOUT_COOLDOWN_DAYS * 1 days;
  }

  function _calculatePollEndDate (
    IAssessment.Configuration calldata CONFIG,
    uint96 accepted,
    uint96 denied,
    uint32 start,
    uint payoutImpact
  ) internal pure returns (uint32) {
    if (accepted == 0 && denied == 0) {
      return uint32(start + CONFIG.MIN_VOTING_PERIOD_DAYS * 1 days);
    }

    uint consensusDrivenStrength = uint(
      abs(int(2 * accepted * PRECISION / (accepted + denied)) - int(PRECISION))
    );
    uint tokenDrivenStrength = min((accepted + denied) * PRECISION / payoutImpact, 10 * PRECISION) / 10;

    return uint32(start + CONFIG.MIN_VOTING_PERIOD_DAYS * 1 days +
      (1 * PRECISION - min(consensusDrivenStrength,  tokenDrivenStrength)) *
      (CONFIG.MAX_VOTING_PERIOD_DAYS * 1 days - CONFIG.MIN_VOTING_PERIOD_DAYS * 1 days) / PRECISION);
  }

  function _calculatePollEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Poll memory poll,
    uint payoutImpact
  ) internal pure returns (uint32) {
    return _calculatePollEndDate(CONFIG, poll.accepted, poll.denied, poll.start, payoutImpact);
  }

}

library AssessmentGovernanceActionsLib {

  function updateUintParameters (
    IAssessment.Configuration memory CONFIG,
    IAssessment.UintParams[] calldata paramNames,
    uint[] calldata values
  ) external pure returns (IAssessment.Configuration memory) {
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == IAssessment.UintParams.REWARD_PERC) {
        CONFIG.REWARD_PERC = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.INCIDENT_IMPACT_ESTIMATE_PERC) {
        CONFIG.INCIDENT_IMPACT_ESTIMATE_PERC = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.MIN_VOTING_PERIOD_DAYS) {
        CONFIG.MIN_VOTING_PERIOD_DAYS = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.MAX_VOTING_PERIOD_DAYS) {
        CONFIG.MAX_VOTING_PERIOD_DAYS = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.PAYOUT_COOLDOWN_DAYS) {
        CONFIG.PAYOUT_COOLDOWN_DAYS = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.CLAIM_ASSESSMENT_DEPOSIT_PERC) {
        CONFIG.CLAIM_ASSESSMENT_DEPOSIT_PERC = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.INCIDENT_ASSESSMENT_DEPOSIT_PERC) {
        CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC = uint16(values[i]);
        continue;
      }
    }
    return CONFIG;
  }

  function getFraudulentAssessorLeaf (
    address account,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount
  ) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(account, lastFraudulentVoteIndex, burnAmount, fraudCount));
  }

  function isFraudProofValid(
    bytes32 root,
    bytes32[] calldata proof,
    address fraudulentAssessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount
  ) external pure returns (bool) {
    return MerkleProof.verify(proof, root,
     getFraudulentAssessorLeaf(
        fraudulentAssessor,
        lastFraudulentVoteIndex,
        burnAmount,
        fraudCount
      )
    );
  }

  function processFraudulentVote (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Vote memory vote,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents,
    mapping(uint8 => mapping(uint104 => IAssessment.Poll)) storage pollFraudOfEvent
  ) internal {

    IAssessment.Poll memory poll;
    if (IAssessment.EventType(vote.eventType) == IAssessment.EventType.CLAIM) {
      IAssessment.Claim memory claim = claims[vote.eventId];
      if (claim.details.payoutRedeemed) {
        // Once the payout is redeemed the poll result is final
        return;
      }
      poll = claim.poll;
    } else {
      poll = incidents[vote.eventId].poll;
    }

    {
      IAssessment.Poll memory pollFraud = pollFraudOfEvent[vote.eventType][vote.eventId];

      // Copy the current poll results before correction starts
      if (!AssessmentUtilsLib.pollFraudExists(pollFraud)) {
        pollFraudOfEvent[vote.eventType][vote.eventId] = poll;
      }
    }

    {
      uint32 blockTimestamp = uint32(block.timestamp);
      if (blockTimestamp >= AssessmentUtilsLib._getCooldownEndDate(CONFIG, poll.end)) {
        // Once the cooldown period ends the poll result is final
        return;
      }

      if (vote.accepted) {
        poll.accepted -= vote.tokenWeight;
      } else {
        poll.denied -= vote.tokenWeight;
      }

      if (blockTimestamp < poll.end) {
        poll.end = blockTimestamp;
      }
    }

    if (IAssessment.EventType(vote.eventType) == IAssessment.EventType.CLAIM) {
      claims[vote.eventId].poll = poll;
    } else {
      incidents[vote.eventId].poll = poll;
    }
  }

  function processFraudResolution (
    IAssessment.Configuration calldata CONFIG,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize,
    address fraudulentAssessor,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    mapping(uint8 => mapping(uint104 => IAssessment.Poll)) storage pollFraudOfEvent,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) external {
    uint processUntil;
    IAssessment.Stake memory stake = stakeOf[fraudulentAssessor];

    // [todo] Check this
    if (
      voteBatchSize == 0 ||
      stake.rewardsWithdrawnUntilIndex + voteBatchSize >= lastFraudulentVoteIndex
    ) {
      processUntil = lastFraudulentVoteIndex + 1;
    } else {
      processUntil = stake.rewardsWithdrawnUntilIndex + voteBatchSize;
    }

    for (uint j = stake.rewardsWithdrawnUntilIndex; j < processUntil; j++) {
      processFraudulentVote(CONFIG, votesOf[fraudulentAssessor][j], claims, incidents, pollFraudOfEvent);
    }

    if (fraudCount == stake.fraudCount) {
      // Burns an assessor only once for each merkle root, no matter how many times this function
      // runs on the same account. When a transaction is too big to fit in one block, it is batched
      // in multiple transactions according to voteBatchSize. After burning the tokens, fraudCount
      // is incremented. If another merkle root is submitted that contains the same addres, the leaf
      // should use the updated fraudCount stored in the Stake struct as input.
      //nxm.burn(uint(stake.amount));
      stake.amount -= burnAmount;
      stake.fraudCount++;
    }

    stake.rewardsWithdrawnUntilIndex = uint104(processUntil);
    stakeOf[fraudulentAssessor] = stake;

  }
}

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

    uint payoutImpact = AssessmentUtilsLib._getPayoutImpactOfClaim(claim);
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

library AssessmentVoteLib {

  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint16 internal constant PERC_BASIS_POINTS = 10000;

  function _getTotalRewardForEvent (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.EventType eventType,
    uint104 id,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) internal view returns (uint) {
    if (eventType == IAssessment.EventType.CLAIM) {
      IAssessment.ClaimDetails memory claimDetails = claims[id].details;
      return claimDetails.amount * CONFIG.REWARD_PERC * claimDetails.coverPeriod / 365 / PERC_BASIS_POINTS;
    } else {
      IAssessment.IncidentDetails memory incidentDetails = incidents[id].details;
      return incidentDetails.activeCoverAmount * CONFIG.REWARD_PERC / PERC_BASIS_POINTS;
    }
  }

  // [todo] Expose a view to find out the last index until withdrawals can be made and also
  //  views for total rewards and withdrawable rewards
  function withdrawReward (
    IAssessment.Configuration calldata CONFIG,
    INXMToken nxm,
    address user,
    uint104 untilIndex,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) external returns (uint rewardToWithdraw, uint104 withdrawUntilIndex) {
    IAssessment.Stake memory stake = stakeOf[user];
    {
      uint voteCount = votesOf[user].length;
      withdrawUntilIndex = untilIndex > 0 ? untilIndex : uint104(voteCount);
      require(
        untilIndex <= voteCount,
        "Vote count is smaller that the provided untilIndex"
      );
      require(stake.rewardsWithdrawnUntilIndex < voteCount, "No withdrawable rewards");
    }

    uint totalReward;
    for (uint i = stake.rewardsWithdrawnUntilIndex; i < withdrawUntilIndex; i++) {
      IAssessment.Vote memory vote = votesOf[user][i];
      require(
        block.timestamp > AssessmentUtilsLib._getVoteLockupEndDate(CONFIG, vote),
        "Cannot withdraw rewards from votes which are in lockup period"
      );
      IAssessment.Poll memory poll =
        IAssessment.EventType(vote.eventType) == IAssessment.EventType.CLAIM
        ? claims[vote.eventId].poll
        : incidents[vote.eventId].poll;

      totalReward = _getTotalRewardForEvent(
        CONFIG,
        IAssessment.EventType(vote.eventType),
        vote.eventId,
        claims,
        incidents
      );
      rewardToWithdraw += totalReward * vote.tokenWeight / (poll.accepted + poll.denied);
    }

    stakeOf[user].rewardsWithdrawnUntilIndex = withdrawUntilIndex;
    nxm.mint(user, rewardToWithdraw);
  }

  function castVote (
    IAssessment.Configuration calldata CONFIG,
    uint8 eventType,
    uint104 id,
    bool accepted,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    mapping(bytes32 => bool) storage hasAlreadyVotedOn,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) external {

    {
      bytes32 voteHash = keccak256(abi.encodePacked(id, msg.sender, eventType));
      require(!hasAlreadyVotedOn[voteHash], "Already voted");
      hasAlreadyVotedOn[voteHash] = true;
    }

    IAssessment.Stake memory stake = stakeOf[msg.sender];
    require(stake.amount > 0, "A stake is required to cast votes");

    uint payoutImpact;
    IAssessment.Poll memory poll;
    uint32 blockTimestamp = uint32(block.timestamp);
    if (IAssessment.EventType(eventType) == IAssessment.EventType.CLAIM) {
      IAssessment.Claim memory claim = claims[id];
      poll = claims[id].poll;
      payoutImpact = AssessmentUtilsLib._getPayoutImpactOfClaim(claim);
      require(blockTimestamp < poll.end, "Voting is closed");
    } else {
      IAssessment.Incident memory incident = incidents[id];
      poll = incidents[id].poll;
      payoutImpact = AssessmentIncidentsLib._getPayoutImpactOfIncident(incident);
      require(blockTimestamp < poll.end, "Voting is closed");
    }

    require(
      poll.accepted > 0 || accepted == true,
      "At least one accept vote is required to vote deny"
    );

    if (accepted) {
      if (poll.accepted == 0) {
        poll.start = blockTimestamp;
      }
      poll.accepted += stake.amount;
    } else {
      poll.denied += stake.amount;
    }

    poll.end = AssessmentUtilsLib._calculatePollEndDate(CONFIG, poll, payoutImpact);

    if (poll.end < blockTimestamp) {
      // When poll end date falls in the past, replace it with the current block timestamp
      poll.end = blockTimestamp;
    }

    // [todo] Add condition when vote shifts poll end in the past and write end with the
    // current blcok timestamp. Could also consider logic where the consensus is shifted at the
    // very end of the voting period.

    if (IAssessment.EventType(eventType) == IAssessment.EventType.CLAIM) {
      claims[id].poll = poll;
    } else {
      incidents[id].poll = poll;
    }

    votesOf[msg.sender].push(IAssessment.Vote(
      id,
      accepted,
      blockTimestamp,
      stake.amount,
      eventType
    ));
  }

  function withdrawStake (
    IAssessment.Configuration calldata CONFIG,
    INXMToken nxm,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    uint96 amount
  ) external {
    IAssessment.Stake storage stake = stakeOf[msg.sender];
    require(stake.amount != 0, "No tokens staked");
    uint voteCount = votesOf[msg.sender].length;
    require(
      block.timestamp > AssessmentUtilsLib._getVoteLockupEndDate(CONFIG, votesOf[msg.sender][voteCount - 1]),
      "Cannot withdraw stake while in lockup period"
     );

    nxm.transferFrom(address(this), msg.sender, amount);
    stake.amount -= amount;
  }
}

contract AssessmentViewer is MasterAwareV2 {
  /*
   *  Claim structure but in a human-friendly format.
   *
   *  Contains aggregated values that give an overall view about the claim and other relevant
   *  pieces of information such as cover period, asset symbol etc. This structure is not used in
   *  any storage variables.
   */
  struct ClaimDisplay {
    uint id;
    uint productId;
    uint coverId;
    uint amount;
    string assetSymbol;
    uint coverStart;
    uint coverEnd;
    uint start;
    uint end;
    string claimStatus;
    string payoutStatus;
  }

  constructor(address _master) {
    master = INXMMaster(_master);
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  function changeDependentContractAddress() external override {
    INXMMaster master = INXMMaster(master);
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
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
    (
      IAssessment.Poll memory poll,
      IAssessment.ClaimDetails memory details
    ) = assessment().claims(id);

    string memory claimStatusDisplay;
    string memory payoutStatusDisplay;
    {
      IAssessment.PollStatus claimStatus = AssessmentUtilsLib._getPollStatus(poll);
      if (claimStatus == IAssessment.PollStatus.ACCEPTED) {
        claimStatusDisplay = "Accepted";
      } else if (claimStatus == IAssessment.PollStatus.DENIED) {
        claimStatusDisplay = "Denied";
      } else if (claimStatus == IAssessment.PollStatus.PENDING) {
        claimStatusDisplay = "Pending";
      }

      if (claimStatus == IAssessment.PollStatus.DENIED) {
        payoutStatusDisplay = "Denied";
      } else if (claimStatus == IAssessment.PollStatus.ACCEPTED && details.payoutRedeemed) {
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
    {
      if (IAssessment.Asset(details.payoutAsset) == IAssessment.Asset.ETH) {
        assetSymbol = "ETH";
      } else if (IAssessment.Asset(details.payoutAsset) == IAssessment.Asset.DAI) {
        assetSymbol = "DAI";
      }
    }

    return ClaimDisplay(
      id,
      productId,
      details.coverId,
      details.amount,
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
}

library AssessmentIncidentsLib {
  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint16 internal constant PERC_BASIS_POINTS = 10000;

  function _getPayoutImpactOfIncident (IAssessment.Incident memory incident) internal pure returns (uint) {
    uint96 activeCoverAmount = incident.details.activeCoverAmount;
    uint16 impactEstimatePerc = incident.details.impactEstimatePerc;
    return activeCoverAmount * impactEstimatePerc / PERC_BASIS_POINTS;
  }

  // [todo] In case of duplicate incidents, allow an incident to be marked as duplicate by the
  // proponent. They will need to provide an id which will compare productId, date, and priceBefore
  // within certain tolerated ranges and if the two match, it allows the proponent to withdraw
  // their deposit and transition the incident to a final state.

  function releaseIncidentAssessmentDeposit (
    uint104 id,
    IAssessment.Incident[] storage incidents,
    INXMToken nxm
  ) external {
    //IAssessment.Incident memory incident = incidents[id];

    //require(block.timestamp >= incident.poll.end, "The incident is in cooldown period");

    //uint16 assessmentDepositPerc = incident.details.assessmentDepositPerc;
    //require(assessmentDepositPerc > 0, "Incident did not require an assessment deposit");

    //IAssessment.PollStatus status = IAssessment._getPollStatus(incident.poll);
    //uint payoutImpact = IAssessment._getPayoutImpactOfIncident(incident);
    //uint deposit = payoutImpact * assessmentDepositPerc / PERC_BASIS_POINTS;

    //require(incident.details.depositRedeemed, "Assessment deposit was already redeemed");
    //incidents[id].details.depositRedeemed = true;
    //if (status == IAssessment.PollStatus.ACCEPTED) {
      //nxm.transferFrom(address(this), incidentProponent[id], deposit);
    //}
    //if (status == IAssessment.PollStatus.DENIED) {
      //nxm.burn(deposit);
    //}
  }

  function getIncidentToSubmit(
    IAssessment.Configuration calldata CONFIG,
    INXMToken nxm,
    IMemberRoles memberRoles,
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external returns (IAssessment.AffectedToken memory, IAssessment.Incident memory) {
    require(
      memberRoles.checkRole(msg.sender, uint(IMemberRoles.Role.AdvisoryBoard)),
      "Caller must be an advisory board member"
    );
    uint96 activeCoverAmount = 20000 ether; // NXM, since this will be driven by capacity
    uint8 payoutAsset = uint8(IAssessment.Asset.ETH); // take this form product
    address tokenAddress = 0x0000000000000000000000000000000000000000;

    IAssessment.Incident memory incident = IAssessment.Incident(
      IAssessment.Poll(0,0,uint32(block.timestamp), 0),
      IAssessment.IncidentDetails(
        productId,
        date,
        payoutAsset,
        activeCoverAmount, // NXM
        CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC,
        CONFIG.INCIDENT_IMPACT_ESTIMATE_PERC,
        false
      )
    );

    uint payoutImpact = _getPayoutImpactOfIncident(incident);
    incident.poll.end = AssessmentUtilsLib._calculatePollEndDate(CONFIG, incident.poll, payoutImpact);


    if (CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC > 0) {
      uint deposit = payoutImpact * CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC / PERC_BASIS_POINTS;
      nxm.transferFrom(msg.sender, address(this), deposit);
    }

    IAssessment.AffectedToken memory affectedToken = IAssessment.AffectedToken(priceBefore, tokenAddress);

    return (affectedToken, incident);
  }

  function saveIncident (
    IAssessment.Incident calldata incident,
    IAssessment.Incident[] storage incidents,
    IAssessment.AffectedToken calldata affectedToken,
    mapping(uint104 => IAssessment.AffectedToken) storage tokenAffectedByIncident,
    mapping(uint104 => address) storage incidentProponent
  ) external {
    uint104 nextId = uint104(incidents.length);
    tokenAffectedByIncident[nextId] = affectedToken;
    incidentProponent[nextId] = msg.sender;
    incidents.push(incident);
  }

  function redeemIncidentPayout (
    IPool pool,
    IMemberRoles memberRoles,
    IAssessment.Incident calldata incident,
    uint32 coverId,
    uint payoutAmount,
    mapping(uint => address) storage addressOfAsset
  ) external {
    // [todo] Read the owner from the cover
    address payable coverOwner = payable(0x0000000000000000000000000000000000000000);
    require (coverOwner == msg.sender, "Payout can only be redeemed by cover owner");
    // [todo] Read and verify details from cover
    require(
      AssessmentUtilsLib._getPollStatus(incident.poll) == IAssessment.PollStatus.ACCEPTED,
      "The incident must be accepted"
    );
    require(
      block.timestamp >= incident.poll.end,
      "The incident is in cooldown period"
    );
    // [todo] Destroy and create a new cover nft
    address payable payoutAddress = memberRoles.getClaimPayoutAddress(coverOwner);
    address coverAsset = addressOfAsset[uint(IAssessment.Asset.ETH)]; // [todo]
    bool succeeded = pool.sendClaimPayout(coverAsset, payoutAddress, payoutAmount);
    require(succeeded, "Incident payout failed");
  }
}
