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

  /* ============= CONSTANTS ============= */

  // Used in operations involving NXM tokens and divisions
  uint public constant PRECISION = 10 ** 18;

  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint16 public constant PERC_BASIS_POINTS = 10000;

  /* ========== STATE VARIABLES ========== */

  mapping(uint => address payable) public internalContracts;

  // ERC20 addresses of supported payout assetss (See Asset enum)
  mapping(uint => address) public addressOfAsset;

  // The minimum number of days the users can vote on polls
  uint8 public MIN_VOTING_PERIOD_DAYS;

  // The maximum number of days the users can vote on polls
  uint8 public MAX_VOTING_PERIOD_DAYS;

  // Number of days the users must wait after a poll closes, to redeem payouts.
  uint8 public PAYOUT_COOLDOWN_DAYS;

  // Percentage used to calculate assessment rewards (0-10000 i.e. double decimal precision)
  uint16 public REWARD_PERC;

  // Percentage used to calculate potential impact of an incident
  uint16 public INCIDENT_IMPACT_ESTIMATE_PERC;

  // Percentage out of 1 ETH, used to calculate a flat ETH deposit required for claim submission.
  // If the claim is accepted, the user will receive the deposit back when the payout is redeemed.
  uint16 public CLAIM_ASSESSMENT_DEPOSIT_PERC;

  // Percentage used to calculate the NXM deposit required for incident submission.
  uint16 public INCIDENT_ASSESSMENT_DEPOSIT_PERC;

  // uint168 unused;

  // Stake states of users. (See Stake struct)
  mapping(address => Stake) public stakeOf;

  // Votes of users. (See Vote struct)
  mapping(address => Vote[]) public votesOf;

  // Mapping used to determine if a user has already voted, using a vote hash as a key
  mapping(bytes32 => bool) public hasAlreadyVotedOn;

  // An array of merkle tree roots used to indicate fraudulent assessors. Each root represents a
  // fraud attempt by one or multiple addresses. Once the root is submitted by adivsory board
  // members through governance, burnFraud uses this root to burn the fraudulent assessors' stakes
  // and correct the outcome of the poll.
  bytes32[] fraudMerkleRoots;

  Claim[] public claims;
  mapping(uint104 => Poll) public pollFraudOfClaim;

  Incident[] public incidents;
  mapping(uint104 => Poll) public pollFraudOfIncident;
  mapping(uint104 => address) public incidentProponent;
  mapping(uint104 => AffectedToken) public tokenAffectedByIncident;


  /* ========== CONSTRUCTOR ========== */

  constructor () {
    // The minimum cover premium is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    REWARD_PERC = 52;

    INCIDENT_IMPACT_ESTIMATE_PERC = 30; // 30%
    MIN_VOTING_PERIOD_DAYS = 3; // days
    MAX_VOTING_PERIOD_DAYS = 30; // days
    PAYOUT_COOLDOWN_DAYS = 1; //days
    CLAIM_ASSESSMENT_DEPOSIT_PERC = 500; // 5% i.e. 0.05 ETH submission flat fee
    INCIDENT_ASSESSMENT_DEPOSIT_PERC = 0;
    addressOfAsset[uint(Asset.ETH)] = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    addressOfAsset[uint(Asset.DAI)] = 0x0000000000000000000000000000000000000000; // [todo]

  }

  /* ========== VIEWS ========== */

  function abs(int x) internal pure returns (int) {
    return x >= 0 ? x : -x;
  }

  function max(uint a, uint b) internal pure returns (uint) {
    return a >= b ? a : b;
  }

  function min(uint a, uint b) internal pure returns (uint) {
    return a <= b ? a : b;
  }

  function pollFraudExists(Poll memory poll) internal pure returns (bool) {
    return poll.started > 0;
  }

  /// @dev Returns block timestamp truncated to 32 bits
  function _blockTimestamp() internal view returns (uint32) {
    return uint32(block.timestamp);
  }

  function nxm() internal view returns (INXMToken) {
    return INXMToken(internalContracts[uint(ID.TK)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function _getPollState (Poll memory poll)
  internal pure returns (uint96 accepted, uint96 denied, uint32 started, uint32 ended) {
    accepted = poll.accepted;
    denied = poll.denied;
    started = poll.started;
    ended = poll.ended;
  }

  function _getPayoutImpactOfClaim (Claim memory claim) internal pure returns (uint) {
    return claim.details.amount * PRECISION / claim.details.nxmPriceSnapshot;
  }

  function getPayoutImpactOfClaim (uint104 id) external view returns (uint) {
    Claim memory claim = claims[id];
    return _getPayoutImpactOfClaim(claim);
  }

  function _getPayoutImpactOfIncident (Incident memory incident) internal pure returns (uint) {
    uint96 activeCoverAmount = incident.details.activeCoverAmount;
    uint16 impactEstimatePerc = incident.details.impactEstimatePerc;
    return activeCoverAmount * impactEstimatePerc / PERC_BASIS_POINTS;
  }

  function getPayoutImpactOfIncident (uint104 id) external view returns (uint) {
    Incident memory incident = incidents[id];
    return _getPayoutImpactOfIncident(incident);
  }

  function _calculatePollEndDate (
    uint96 accepted,
    uint96 denied,
    uint32 started,
    uint payoutImpact
  ) internal view returns (uint32) {
    if (accepted == 0 && denied == 0) {
      return uint32(started + MIN_VOTING_PERIOD_DAYS * 1 days);
    }

    uint consensusDrivenStrength = uint(
      abs(int(2 * accepted * PRECISION / (accepted + denied)) - int(PRECISION))
    );
    uint tokenDrivenStrength = min((accepted + denied) * PRECISION / payoutImpact, 10 * PRECISION) / 10;

    return uint32(started + MIN_VOTING_PERIOD_DAYS * 1 days +
      (1 * PRECISION - min(consensusDrivenStrength,  tokenDrivenStrength)) *
      (MAX_VOTING_PERIOD_DAYS * 1 days - MIN_VOTING_PERIOD_DAYS * 1 days) / PRECISION);
  }

  function _calculatePollEndDate (Poll memory poll, uint payoutImpact) internal view returns (uint32) {
    (uint96 accepted, uint96 denied, uint32 started,) = _getPollState(poll);
    return _calculatePollEndDate(accepted, denied, started, payoutImpact);
  }

  function _getPollEndDate (uint eventType, uint104 id) internal view returns (uint32) {
    if (EventType(eventType) == EventType.CLAIM) {
      return claims[id].poll.ended;
    }
    if (EventType(eventType) == EventType.INCIDENT) {
      return incidents[id].poll.ended;
    }
    revert("Assessment: Unsupported eventType");
  }

  function getVotingPeriodEnd (uint eventType, uint104 id) external view returns (uint32) {
    return _getPollEndDate(eventType, id);
  }

  function _getCooldownEndDate (uint32 pollEnd) internal view returns (uint32) {
    return pollEnd + PAYOUT_COOLDOWN_DAYS * 1 days;
  }

  function getEndOfCooldownPeriod (uint eventType, uint104 id) external view returns (uint32) {
    return _getCooldownEndDate(_getPollEndDate(eventType, id));
  }

  function _isClaimInCooldownPeriod (Claim memory claim) internal view returns (bool) {
    return _blockTimestamp() < _getCooldownEndDate(claim.poll.ended);
  }

  function _getVoteLockupPeriodEnd (Vote memory vote) internal view returns (uint) {
    return vote.timestamp + MAX_VOTING_PERIOD_DAYS + PAYOUT_COOLDOWN_DAYS;
  }

  function getVoteLockupPeriodEnd (address user, uint voteId) external view returns (uint) {
    Vote memory vote = votesOf[user][voteId];
    return _getVoteLockupPeriodEnd(vote);
  }

  function _getPollStatus(Poll memory poll) internal view returns (PollStatus) {
    if (_blockTimestamp() < poll.ended) {
      return PollStatus.PENDING;
    }

    if (poll.accepted > poll.denied) {
      return PollStatus.ACCEPTED;
    } else {
      return PollStatus.DENIED;
    }
  }

  function getPollStatus(uint eventType, uint104 id) external view returns (PollStatus) {
    if (EventType(eventType) == EventType.CLAIM) {
      Claim memory claim = claims[id];
      return _getPollStatus(claim.poll);
    }

    if (EventType(eventType) == EventType.INCIDENT) {
      Incident memory incident = incidents[id];
      return _getPollStatus(incident.poll);
    }
    revert("Assessment: Unsupported eventType");
  }

  function getFraudulentAssessorLeaf (
    address account,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount
  ) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(account, lastFraudulentVoteIndex, burnAmount, fraudCount));
  }

  /**
   *  Returns a Claim aggregated in a human-friendly format.
   *
   *  @dev This view is meant to be used in user interfaces to get a claim in a format suitable for
   *  displaying all relevant information in as few calls as possible. See ClaimDisplay struct.
   *
   *  @param id    Claim identifier for which the ClaimDisplay is returned
   */
  function getClaimToDisplay (uint104 id) public view returns (ClaimDisplay memory) {
    Claim memory claim = claims[id];

    string memory claimStatusDisplay;
    string memory payoutStatusDisplay;
    {
      PollStatus claimStatus = _getPollStatus(claim.poll);
      if (claimStatus == PollStatus.ACCEPTED) {
        claimStatusDisplay = "Accepted";
      } else if (claimStatus == PollStatus.DENIED) {
        claimStatusDisplay = "Denied";
      } else if (claimStatus == PollStatus.PENDING) {
        claimStatusDisplay = "Pending";
      }

      if (claimStatus == PollStatus.DENIED) {
        payoutStatusDisplay = "Denied";
      } else if (claimStatus == PollStatus.ACCEPTED && claim.details.payoutRedeemed) {
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
      if (Asset(claim.details.payoutAsset) == Asset.ETH) {
        assetSymbol = "ETH";
      } else if (Asset(claim.details.payoutAsset) == Asset.DAI) {
        assetSymbol = "DAI";
      }
    }

    return ClaimDisplay(
      id,
      productId,
      claim.details.coverId,
      claim.details.amount,
      assetSymbol,
      coverStart,
      coverEnd,
      claim.poll.started,
      claim.poll.ended,
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
  function getClaimsToDisplay (uint104 from, uint104 to) external view
  returns (ClaimDisplay[] memory) {
    ClaimDisplay[] memory claimDisplays = new ClaimDisplay[](to-from+1);
    for (uint104 id = from; id <= to; id++) {
      claimDisplays[id - from] = getClaimToDisplay(id);
    }
    return claimDisplays;
  }

  function _getSubmissionFee() internal view returns (uint) {
    return 1 ether * uint(CLAIM_ASSESSMENT_DEPOSIT_PERC) / uint(PERC_BASIS_POINTS);
  }

  function getVoteCountOfAssessor(address assessor) external view returns (uint) {
    return votesOf[assessor].length;
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
    require(
      msg.value == _getSubmissionFee(),
      "Assessment: Submission fee different that the expected value"
     );
    // [todo] Cover premium and total amount need to be obtained from the cover
    // itself. The premium needs to be converted to NXM using a TWAP at claim time.
    uint96 coverAmount = 1000 ether;
    uint16 coverPeriod = 365;
    uint8 payoutAsset = uint8(Asset.ETH); // take this form cover asset
    //uint80 nxmPriceSnapshot = 147573952589676412928; // 1 NXM ~ 147 DAI
    uint80 nxmPriceSnapshot = uint80(38200000000000000); // 1 NXM ~ 0.0382 ETH
    require(requestedAmount <= coverAmount, "Assessment: Cannot claim more than the covered amount");


    // a snapshot of CLAIM_ASSESSMENT_DEPOSIT_PERC at submission if it ever changes before redeeming
    if (withProof) {
      emit ProofSubmitted(coverId, msg.sender, ipfsProofHash);
    }

    Claim memory claim = Claim(
      Poll(0, 0, _blockTimestamp(), 0),
      ClaimDetails(
        requestedAmount,
        coverId,
        coverPeriod,
        payoutAsset,
        nxmPriceSnapshot,
        CLAIM_ASSESSMENT_DEPOSIT_PERC,
        false
      )
    );

    uint payoutImpact = _getPayoutImpactOfClaim(claim);
    claim.poll.ended = _calculatePollEndDate(claim.poll, payoutImpact);

    claims.push(claim);
  }

  modifier onlyAdvisoryBoard {
    require(
      memberRoles().checkRole(msg.sender, uint(IMemberRoles.Role.AdvisoryBoard)),
      "Assessor: Caller must be an advisory board member"
    );
    _;
  }

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external onlyAdvisoryBoard {
    uint96 activeCoverAmount = 20000 ether; // NXM, since this will be driven by capacity
    uint8 payoutAsset = uint8(Asset.ETH); // take this form product
    address tokenAddress = 0x0000000000000000000000000000000000000000;

    Incident memory incident = Incident(
      Poll(0,0,_blockTimestamp(), 0),
      IncidentDetails(
        productId,
        date,
        payoutAsset,
        activeCoverAmount, // NXM
        INCIDENT_ASSESSMENT_DEPOSIT_PERC,
        INCIDENT_IMPACT_ESTIMATE_PERC,
        false
      )
    );

    uint payoutImpact = _getPayoutImpactOfIncident(incident);
    incident.poll.ended = _calculatePollEndDate(incident.poll, payoutImpact);

    uint104 nextId = uint104(incidents.length);

    if (INCIDENT_ASSESSMENT_DEPOSIT_PERC > 0) {
      uint deposit = payoutImpact * INCIDENT_ASSESSMENT_DEPOSIT_PERC / PERC_BASIS_POINTS;
      nxm().transferFrom(msg.sender, address(this), deposit);
    }

    AffectedToken memory affectedToken = AffectedToken(priceBefore, tokenAddress);

    tokenAffectedByIncident[nextId] = affectedToken;
    incidentProponent[nextId] = msg.sender;
    incidents.push(incident);
  }

  // [todo] In case of duplicate incidents, allow an incident to be marked as duplicate by the
  // proponent. They will need to provide an id which will compare productId, date, and priceBefore
  // within certain tolerated ranges and if the two match, it allows the proponent to withdraw
  // their deposit and transition the incident to a final state.

  function releaseIncidentAssessmentDeposit (uint104 id) external {
    Incident memory incident = incidents[id];

    require(_blockTimestamp() >= incident.poll.ended, "Assessment: The incident is in cooldown period");

    uint16 assessmentDepositPerc = incident.details.assessmentDepositPerc;
    require(assessmentDepositPerc > 0, "Assessment: Incident did not require an assessment deposit");

    PollStatus status = _getPollStatus(incident.poll);
    uint payoutImpact = _getPayoutImpactOfIncident(incident);
    uint deposit = payoutImpact * assessmentDepositPerc / PERC_BASIS_POINTS;

    require(incident.details.depositRedeemed, "Assessment: Assessment deposit was already redeemed");
    incidents[id].details.depositRedeemed = true;
    if (status == PollStatus.ACCEPTED) {
      nxm().transferFrom(address(this), incidentProponent[id], deposit);
    }
    if (status == PollStatus.DENIED) {
      nxm().burn(deposit);
    }
  }

  function depositStake (uint96 amount) external onlyMember {
    Stake storage stake = stakeOf[msg.sender];
    stake.amount += amount;
    nxm().transferFrom(msg.sender, address(this), amount);
  }

  function getTotalRewardForEvent (EventType eventType, uint104 id) internal view returns (uint) {
    if (eventType == EventType.CLAIM) {
      ClaimDetails memory claimDetails = claims[id].details;
      return claimDetails.amount * REWARD_PERC * claimDetails.coverPeriod / 365 / PERC_BASIS_POINTS;
    } else {
      IncidentDetails memory incidentDetails = incidents[id].details;
      return incidentDetails.activeCoverAmount * REWARD_PERC / PERC_BASIS_POINTS;
    }
  }

  function withdrawReward (address user, uint104 untilIndex) external {
    Stake storage stake = stakeOf[user];
    uint voteCount = votesOf[user].length;
    require(
      untilIndex <= voteCount,
      "Assessment: Vote count is smaller that the provided untilIndex"
    );
    require(stake.rewardsWithdrawnUntilIndex < voteCount, "Assessment: No withdrawable rewards");

    uint rewardToWithdraw = 0;
    uint totalReward = 0;
    uint104 withdrawUntilIndex = untilIndex > 0 ? untilIndex : uint104(voteCount);
    for (uint i = stake.rewardsWithdrawnUntilIndex; i < withdrawUntilIndex; i++) {
      Vote memory vote = votesOf[user][i];
      require(
        _blockTimestamp() > _getVoteLockupPeriodEnd(vote),
        "Assessment: Cannot withdraw rewards from votes which are in lockup period"
      );
      Poll memory poll = EventType(vote.eventType) == EventType.CLAIM
        ? claims[vote.eventId].poll
        : incidents[vote.eventId].poll;

      totalReward = getTotalRewardForEvent(EventType(vote.eventType), vote.eventId);
      rewardToWithdraw += totalReward * vote.tokenWeight / (poll.accepted + poll.denied);
    }

    stake.rewardsWithdrawnUntilIndex = withdrawUntilIndex;
    nxm().mint(user, rewardToWithdraw);
  }

  function withdrawStake (uint96 amount) external onlyMember {
    Stake storage stake = stakeOf[msg.sender];
    uint voteCount = votesOf[msg.sender].length;
    require(stake.amount != 0, "Assessment: No tokens staked");
    require(
      _blockTimestamp() > _getVoteLockupPeriodEnd(votesOf[msg.sender][voteCount - 1]),
      "Assessment: Cannot withdraw stake while in lockup period"
     );

    nxm().transferFrom(address(this), msg.sender, amount);
    stake.amount -= amount;
  }

  function redeemClaimPayout (uint104 id, address payable coverOwner) external {
    Claim memory claim = claims[id];
    require(
      _getPollStatus(claim.poll) == PollStatus.ACCEPTED,
      "Assessment: The claim must be accepted"
    );
    require(
      _blockTimestamp() >= _getCooldownEndDate(claim.poll.ended),
      "Assessment: The claim is in cooldown period"
    );
    require(!claim.details.payoutRedeemed, "Assessment: Payout was already redeemed");
    claims[id].details.payoutRedeemed = true;
    // [todo] Destroy and create a new cover nft
    address payable payoutAddress = memberRoles().getClaimPayoutAddress(coverOwner);
    address coverAsset = addressOfAsset[uint(Asset.ETH)]; // [todo]
    bool succeeded = pool().sendClaimPayout(coverAsset, payoutAddress, claim.details.amount);
    require(succeeded, "Assessment: Claim payout failed");
    uint assessmentDepositToRefund = 1 ether * uint(claim.details.assessmentDepositPerc) /
      uint(PERC_BASIS_POINTS);
    (bool refunded, /* bytes data */) = payoutAddress.call{value: assessmentDepositToRefund}("");
    require(refunded, "Assessment: Assessment fee refund failed");
  }

  function _redeemIncidentPayout (
    uint104 incidentId,
    uint32 coverId,
    address payable coverOwner,
    uint payoutAmount
  ) internal {
    Incident memory incident = incidents[incidentId];
    // [todo] Read and verify details from cover
    require(
      _getPollStatus(incident.poll) == PollStatus.ACCEPTED,
      "Assessment: The incident must be accepted"
    );
    require(
      _blockTimestamp() >= incident.poll.ended,
      "Assessment: The incident is in cooldown period"
    );
    // [todo] Destroy and create a new cover nft
    address payable payoutAddress = memberRoles().getClaimPayoutAddress(coverOwner);
    address coverAsset = addressOfAsset[uint(Asset.ETH)]; // [todo]
    bool succeeded = pool().sendClaimPayout(coverAsset, payoutAddress, payoutAmount);
    require(succeeded, "Assessment: Incident payout failed");
  }

  function redeemIncidentPayout (uint104 incidentId, uint32 coverId, uint payoutAmount) external {
    // [todo] Read the owner from the cover
    address coverOwner = 0x0000000000000000000000000000000000000000;
    require (coverOwner == msg.sender, "Assessment: Payout can only be redeemed by cover owner");
    _redeemIncidentPayout(incidentId, coverId, payable(msg.sender), payoutAmount);
  }

  // [todo] Check how many times poll is loaded from storage
  function castVote (uint8 eventType, uint104 id, bool accepted) external onlyMember {
    Stake memory stake = stakeOf[msg.sender];
    Poll memory poll;

    uint32 blockTimestamp = _blockTimestamp();
    bytes32 voteHash = keccak256(abi.encodePacked(id, msg.sender, eventType));
    require(!hasAlreadyVotedOn[voteHash], "Assessment: Already voted");
    hasAlreadyVotedOn[voteHash] = true;

    require(stake.amount > 0, "Assessment: A stake is required to cast votes");

    uint payoutImpact;
    if (EventType(eventType) == EventType.CLAIM) {
      Claim memory claim = claims[id];
      poll = claims[id].poll;
      payoutImpact = _getPayoutImpactOfClaim(claim);
      require(blockTimestamp < poll.ended, "Assessment: Voting is closed");
    } else {
      Incident memory incident = incidents[id];
      poll = incidents[id].poll;
      payoutImpact = _getPayoutImpactOfIncident(incident);
      require(blockTimestamp < poll.ended, "Assessment: Voting is closed");
    }

    require(
      poll.accepted > 0 || accepted == true,
      "Assessment: At least one accept vote is required to vote deny"
    );

    if (accepted) {
      if (poll.accepted == 0) {
        poll.started = blockTimestamp;
      }
      poll.accepted += stake.amount;
    } else {
      poll.denied += stake.amount;

    }

    poll.ended = _calculatePollEndDate(poll, payoutImpact);

    if (poll.ended < blockTimestamp) {
      // When poll end date falls in the past, replace it with the current block timestamp
      poll.ended = blockTimestamp;
    }

    // [todo] Add condition when vote shifts poll end in the past and write ended with the
    // current blcok timestamp. Could also consider logic where the consensus is shifted at the
    // very end of the voting period.

    if (EventType(eventType) == EventType.CLAIM) {
      claims[id].poll = poll;
    } else {
      incidents[id].poll = poll;
    }

    votesOf[msg.sender].push(Vote(
      id,
      accepted,
      blockTimestamp,
      stake.amount,
      eventType
    ));
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
    uint32 blockTimestamp = _blockTimestamp();
    Stake storage stake = stakeOf[fraudulentAssessor];

    require(MerkleProof.verify(
      proof,
      fraudMerkleRoots[rootIndex],
      getFraudulentAssessorLeaf(
        fraudulentAssessor,
        lastFraudulentVoteIndex,
        burnAmount,
        fraudCount
      )
    ), "Assessment: Invalid merkle proof");

    uint processUntil;
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
      Vote memory vote = votesOf[fraudulentAssessor][j];

      uint32 pollEnd;
      if (EventType(vote.eventType) == EventType.CLAIM) {
        Claim memory claim = claims[vote.eventId];
        if (claim.details.payoutRedeemed) {
          // Once the payout is redeemed the poll result is final
          continue;
        }
        pollEnd = claim.poll.ended;

        Poll memory pollFraud = pollFraudOfClaim[vote.eventId];
        // Copy the current poll results before correction starts
        if (!pollFraudExists(pollFraud)) {
          pollFraudOfClaim[vote.eventId] = claim.poll;
        }
      } else {
        Incident memory incident = incidents[vote.eventId];
        pollEnd = incident.poll.ended;

        Poll memory pollFraud = pollFraudOfIncident[vote.eventId];
        // Copy the current poll results before correction starts
        if (!pollFraudExists(pollFraud)) {
          pollFraudOfIncident[vote.eventId] = incident.poll;
        }
      }

      if (blockTimestamp >= _getCooldownEndDate(pollEnd)) {
        // Once the cooldown period ends the poll result is final
        continue;
      }

      // [todo] Check if only one sstore is made
      Poll storage poll;
      if (EventType(vote.eventType) == EventType.CLAIM) {
        poll = claims[vote.eventId].poll;
      } else {
        poll = incidents[vote.eventId].poll;
      }
      if (vote.accepted) {
        poll.accepted -= vote.tokenWeight;
      } else {
        poll.denied -= vote.tokenWeight;
      }

      if (blockTimestamp < pollEnd) {
        poll.ended = blockTimestamp;
      }
    }

    if (fraudCount == stake.fraudCount) {
      // Burns an assessor only once for each merkle root, no matter how many times this function
      // runs on the same account. When a transaction is too big to fit in one block, it is batched
      // in multiple transactions according to voteBatchSize. After burning the tokens, fraudCount
      // is incremented. If another merkle root is submitted that contains the same addres, the leaf
      // should use the updated fraudCount stored in the Stake struct as input.
      nxm().burn(uint(stake.amount));
      stake.amount -= burnAmount;
      stake.fraudCount++;
    }
    stake.rewardsWithdrawnUntilIndex = uint104(processUntil);
  }

  function updateUintParameters (UintParams[] calldata paramNames, uint[] calldata values) external
  {
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == UintParams.REWARD_PERC) {
        REWARD_PERC = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.INCIDENT_IMPACT_ESTIMATE_PERC) {
        INCIDENT_IMPACT_ESTIMATE_PERC = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.MIN_VOTING_PERIOD_DAYS) {
        MIN_VOTING_PERIOD_DAYS = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.MAX_VOTING_PERIOD_DAYS) {
        MAX_VOTING_PERIOD_DAYS = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.PAYOUT_COOLDOWN_DAYS) {
        PAYOUT_COOLDOWN_DAYS = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.CLAIM_ASSESSMENT_DEPOSIT_PERC) {
        CLAIM_ASSESSMENT_DEPOSIT_PERC = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.INCIDENT_ASSESSMENT_DEPOSIT_PERC) {
        INCIDENT_ASSESSMENT_DEPOSIT_PERC = uint16(values[i]);
        continue;
      }
    }
  }

  // [todo] Since this function is called every time contracts change,
  // all internal contracts could be stored here to avoid calls to master when
  // using onlyInternal or simply making a call to another contract.
  // What I have in mind is that every time this function is called, everything should
  // be wiped out and replaced with what is passed as calldata by master. This function
  // should only be callable by master.
  function changeDependentContractAddress() external override {
    INXMMaster master = INXMMaster(master);
    internalContracts[uint(ID.TK)] = master.getLatestAddress("TK");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
  }

}
