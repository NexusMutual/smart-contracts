// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/cryptography/MerkleProof.sol";
import "../../interfaces/INXMToken.sol";
import "../../abstract/MasterAwareV2.sol";
import "hardhat/console.sol";

/**
 *  Provides a way for cover owners to submit claims and redeem the payouts and facilitates
 *  assessment processes where members decide the outcome of the events that lead to potential
 *  payouts.
 */
contract Assessment is MasterAwareV2 {

  /* ========== DATA STRUCTURES ========== */

  enum PollStatus { PENDING, ACCEPTED, DENIED }

  enum EventType { CLAIM, INCIDENT }

  enum Asset { ETH, DAI }

  enum UintParams {
    REWARD_PERC,
    FLAT_ETH_FEE_PERC,
    INCIDENT_TOKEN_WEIGHT_PERC,
    VOTING_PERIOD_DAYS_MIN,
    VOTING_PERIOD_DAYS_MAX,
    PAYOUT_COOLDOWN_DAYS
  }

  struct Stake {
    uint104 amount;
    uint104 voteRewardCursor;
    uint16 fraudCount;
    /*uint32 unused,*/
  }

  /**
   *  Holds data for a vote belonging to an assessor.
   *
   *  @dev This structure is used to keep track of user's votes. Each vote is used to determine
   *  a user's share of rewards or to create a fraud resolution which excludes fraudulent votes
   * from the initial poll.
   *
   *  @param eventId      Can be either a claimId or an IncidentId
   *  @param accepted     If the assessor voted to accept the event it's true otherwise it's false
   *  @param timestamp    Date and time when the vote was cast
   *  @param tokenWeight  How many tokens were staked when the vote was cast
   *  @param eventType    Can be a claim or an incident (See EventType enum)
   */
  struct Vote {
    uint104 eventId;
    bool accepted;
    uint32 timestamp;
    uint104 tokenWeight;
    EventType eventType;
  }

  struct Poll {
    uint112 accepted;
    uint112 denied;
    uint32 voteStart;
  }

  /**
   *  Holds the requested amount, NXM price, submission fee and other relevant details
   *  such as parts of the corresponding cover details and the payout status.
   *
   *  @dev This structure has snapshots of claim-time states that are considered moving targets
   *  but also parts of cover details that reduce the need of external calls. Everything is fitted
   *  in a single word that contains:
   *
   *  @param amount            Amount requested as part of this claim up to the total cover amount
   *  @param coverId           The identifier of the cover on which this claim is submitted
   *  @param coverPeriod       Cover period represented as days, used to calculate rewards
   *  @param asset             The asset which is expected at payout. E.g ETH, DAI (See Asset enum)
   *  @param nxmPriceSnapshot  The price (TWAP) of 1 NXM in the given asset at claim-time
   *  @param flatEthFeePerc    A snapshot of FLAT_ETH_FEE_PERC if it is changed before the payout
   *  @param pyaoutComplete    True if the payout is complete, prevents further payouts on the claim
   *
   */
  struct ClaimDetails {
    uint96 amount;
    uint32 coverId;
    uint16 coverPeriod;
    Asset asset;
    uint80 nxmPriceSnapshot;
    uint16 flatEthFeePerc;
    bool payoutComplete;
  }

  struct Claim {
    Poll poll;
    ClaimDetails details;
  }

  /**
   *  Claim but in a human-friendly format.
   *
   *  @dev Contains aggregated values that give an overall view about the claim and other relevant
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
    uint voteStart;
    uint voteEnd;
    string claimStatus;
    string payoutStatus;
  }

  struct IncidentDetails {
    uint96 activeCoverAmount; // ETH or DAI
    uint24 productId;
    Asset asset;
    uint80 nxmPriceSnapshot; // NXM price in ETH or DAI
  }

  struct Incident {
    Poll poll;
    IncidentDetails details;
  }

  struct FraudResolution {
    uint112 accepted;
    uint112 denied;
    bool exists;
    /*uint24 unused,*/
  }

  /* ============= CONSTANTS ============= */

  uint public constant PRECISION = 10 ** 18;
  uint16 public constant PERC_BASIS_POINTS = 10000; // 2 decimals

  /* ========== STATE VARIABLES ========== */

  INXMToken public nxm;
  address public DAI_ADDRESS;
  uint16 public REWARD_PERC;
  uint16 public FLAT_ETH_FEE_PERC;
  uint8 public INCIDENT_TOKEN_WEIGHT_PERC;
  uint8 public VOTING_PERIOD_DAYS_MIN;
  uint8 public VOTING_PERIOD_DAYS_MAX;
  uint8 public PAYOUT_COOLDOWN_DAYS;

  mapping(address => Stake) public stakeOf;
  mapping(address => Vote[]) public votesOf;

  bytes32[] fraudMerkleRoots;

  Claim[] public claims;
  mapping(uint104 => FraudResolution) public fraudResolutionOfClaim;

  Incident[] public incidents;
  mapping(uint104 => FraudResolution) public fraudResolutionOfIncident;

  /* ========== CONSTRUCTOR ========== */

  constructor (address _nxm) {

    nxm = INXMToken(_nxm);

    // The minimum cover premium is 2.6%
    // 20% of the cover premium is:
    // 2.6% * 20% = 0.52%
    REWARD_PERC = 52;

    INCIDENT_TOKEN_WEIGHT_PERC = 30; // 30%
    VOTING_PERIOD_DAYS_MIN = 3; // days
    VOTING_PERIOD_DAYS_MAX = 30; // days
    PAYOUT_COOLDOWN_DAYS = 1; //days
    FLAT_ETH_FEE_PERC = 500; // 5% i.e. 0.05 ETH submission flat fee
    DAI_ADDRESS = 0x0000000000000000000000000000000000000000;

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

  /// @dev Returns block timestamp truncated to 32 bits
  function _blockTimestamp() internal view returns (uint32) {
      return uint32(block.timestamp);
  }

  function _getVotingPeriodEnd (
    uint accepted,
    uint denied,
    uint voteStart,
    uint payoutImpact
  ) internal view returns (uint32) {
    if (accepted == 0 && denied == 0) {
      return uint32(voteStart + VOTING_PERIOD_DAYS_MIN * 1 days);
    }

    uint consensusStrength = uint(
      abs(int(2 * accepted * PRECISION / (accepted + denied)) - int(PRECISION))
    );
    uint tokenWeightStrength = min((accepted + denied) * PRECISION / payoutImpact, 10 * PRECISION);

    return uint32(voteStart + VOTING_PERIOD_DAYS_MIN * 1 days +
      (1 * PRECISION - min(consensusStrength,  tokenWeightStrength)) *
      (VOTING_PERIOD_DAYS_MAX * 1 days - VOTING_PERIOD_DAYS_MIN * 1 days) / PRECISION);
  }

  function _getEndOfCooldownPeriod (uint32 voteEnd) internal view returns (uint32) {
    return voteEnd + PAYOUT_COOLDOWN_DAYS * 1 days;
  }

  function _getPollState (Poll memory poll)
  internal pure returns ( uint112 accepted, uint112 denied, uint32 voteStart) {
    accepted = poll.accepted;
    denied = poll.denied;
    voteStart = poll.voteStart;
  }

  function _getPayoutImpactOfClaim (Claim memory claim) internal pure returns (uint) {
    return claim.details.amount;
  }

  function _getPayoutImpactOfIncident (Incident memory incident) internal view returns (uint) {
   return incident.details.activeCoverAmount * INCIDENT_TOKEN_WEIGHT_PERC / 100;
  }

  function getVotingPeriodEnd (EventType eventType, uint104 id) public view returns (uint32) {
    uint112 accepted;
    uint112 denied;
    uint32 voteStart;
    uint payoutImpact;

    if (eventType == EventType.CLAIM) {
      Claim memory claim = claims[id];
      (accepted, denied, voteStart) = _getPollState(claim.poll);
      payoutImpact = _getPayoutImpactOfClaim(claim);
    } else {
      Incident memory incident = incidents[id];
      (accepted, denied, voteStart) = _getPollState(incident.poll);
      payoutImpact = _getPayoutImpactOfIncident(incident);
    }

    return _getVotingPeriodEnd(accepted, denied, voteStart, payoutImpact);
  }

  function getEndOfCooldownPeriod (EventType eventType, uint104 id) public view returns (uint32) {
    return _getEndOfCooldownPeriod(getVotingPeriodEnd(eventType, id));
  }

  function isInCooldownPeriod (EventType eventType, uint104 id) public view returns (bool) {
    return _blockTimestamp() > getEndOfCooldownPeriod(eventType, id);
  }

  function hasVotingPeriodEnded (EventType eventType, uint104 id) public view returns (bool) {
    return _blockTimestamp() > getVotingPeriodEnd(eventType, id);
  }

  function getPollStatus(EventType eventType, uint104 id) public view returns (PollStatus) {
    FraudResolution memory fraudResolution = eventType == EventType.CLAIM
        ? fraudResolutionOfClaim[id]
        : fraudResolutionOfIncident[id];
    if (fraudResolution.exists) {
      return fraudResolution.accepted > fraudResolution.denied
        ? PollStatus.ACCEPTED
        : PollStatus.DENIED;
    }

    if (!hasVotingPeriodEnded(eventType, id)) {
      return PollStatus.PENDING;
    }


    Poll memory poll = eventType == EventType.CLAIM
        ? claims[id].poll
        : incidents[id].poll;
    return poll.accepted > poll.denied ? PollStatus.ACCEPTED : PollStatus.DENIED;
  }

  function canWithdrawPayout (EventType eventType, uint104 id) external view returns (bool) {
    return getPollStatus(eventType, id) == PollStatus.ACCEPTED && isInCooldownPeriod(eventType, id);
  }

  function getFraudulentAssessorLeaf (
    address account,
    uint256 lastFraudulentVoteIndex,
    uint104 burnAmount,
    uint16 fraudCount
  ) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(account, lastFraudulentVoteIndex, burnAmount, fraudCount));
  }

  /**
   *  Returns claims aggregated in a human-friendly format.
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
    for (uint104 claimId = from; claimId <= to; claimId++) {
      Claim memory claim = claims[claimId];
      string memory claimStatusDisplay;
      string memory payoutStatusDisplay;
      {
        PollStatus claimStatus = getPollStatus(EventType.CLAIM, claimId);
        if (claimStatus == PollStatus.ACCEPTED) {
          claimStatusDisplay = "Accepted";
        } else if (claimStatus == PollStatus.DENIED) {
          claimStatusDisplay = "Denied";
        } else if (claimStatus == PollStatus.PENDING) {
          claimStatusDisplay = "Pending";
        }

        if (claimStatus == PollStatus.DENIED) {
          payoutStatusDisplay = "Denied";
        } else if (claimStatus == PollStatus.ACCEPTED && claim.details.payoutComplete) {
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
      uint voteEnd = getVotingPeriodEnd(EventType.CLAIM, claimId);
      string memory assetSymbol;
      {
        if (claim.details.asset == Asset.ETH) {
          assetSymbol = "ETH";
        } else if (claim.details.asset == Asset.DAI) {
          assetSymbol = "DAI";
        }
      }
      claimDisplays[claimId - from] = ClaimDisplay(
        claimId,
        productId,
        claim.details.coverId,
        claim.details.amount,
        assetSymbol,
        coverStart,
        coverEnd,
        claim.poll.voteStart,
        voteEnd,
        claimStatusDisplay,
        payoutStatusDisplay
      );
    }
    return claimDisplays;
  }

  function getSubmissionFee() internal view returns (uint) {
    return 1 ether * uint(FLAT_ETH_FEE_PERC) / uint(PERC_BASIS_POINTS);
  }

  function getVoteCountOfAssessor(address assessor) external view returns (uint) {
    return votesOf[assessor].length;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /**
   *  Submits a claim for assessment
   *
   *  @dev This function requires an ETH submission fee. See: getSubmissionFee()
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
      msg.value == getSubmissionFee(),
      "Assessment: Submission fee different that the expected value"
     );
    // [todo] Cover premium and total amount need to be obtained from the cover
    // itself. The premium needs to be converted to NXM using a TWAP at claim time.
    uint96 coverAmount = 1000 ether;
    uint16 coverPeriod = 365;
    Asset asset = Asset.ETH; // take this form cover asset
    uint80 nxmPriceSnapshot = uint80(1 ether);

    // a snapshot of FLAT_ETH_FEE_PERC at submission if it ever changes before redeeming
    if (withProof) {
      emit ProofSubmitted(coverId, msg.sender, ipfsProofHash);
    }
    claims.push(Claim(
      Poll(0,0,_blockTimestamp()),
      ClaimDetails(
        requestedAmount,
        coverId,
        coverPeriod,
        asset,
        nxmPriceSnapshot,
        FLAT_ETH_FEE_PERC,
        false
      )
    ));
  }

  function submitIncident(uint24 productId, uint112 priceBefore) external payable onlyMember {
    uint96 activeCoverAmount = 20000 ether;
    Asset asset = Asset.ETH; // take this form product underlying asset
    uint80 nxmPriceSnapshot = uint80(1 ether);

    incidents.push(Incident(
      Poll(0,0,_blockTimestamp()),
      IncidentDetails (
        activeCoverAmount, // ETH or DAI
        productId,
        asset,
        nxmPriceSnapshot // NXM price in ETH or DAI
      )
    ));
  }

  function depositStake (uint104 amount) external onlyMember {
    Stake storage stake = stakeOf[msg.sender];
    stake.amount += amount;
    nxm.transferFrom(msg.sender, address(this), amount);
  }

  function withdrawReward (address user, uint104 untilIndex) external {
    Stake storage stake = stakeOf[user];
    uint voteCount = votesOf[user].length;
    require(
      untilIndex <= voteCount,
      "Assessment: Vote count is smaller that the provided untilIndex"
    );
    require(stake.voteRewardCursor < voteCount, "Assessment: No withdrawable rewards");

    uint rewardToWithdraw = 0;
    uint totalReward = 0;
    uint withdrawUntilIndex = untilIndex > 0 ? untilIndex : voteCount;
    for (uint i = stake.voteRewardCursor; i < withdrawUntilIndex; i++) {
      Vote memory vote = votesOf[user][i];
      require(_blockTimestamp() > vote.timestamp + VOTING_PERIOD_DAYS_MAX + PAYOUT_COOLDOWN_DAYS);
      if (vote.eventType == EventType.CLAIM) {
        Claim memory claim = claims[vote.eventId];
        totalReward = claim.details.amount * REWARD_PERC * claim.details.coverPeriod / 365 / PERC_BASIS_POINTS;
        rewardToWithdraw += totalReward * vote.tokenWeight /
          (claim.poll.accepted + claim.poll.denied);
      } else {
        Incident memory incident = incidents[vote.eventId];
        totalReward = incident.details.activeCoverAmount * REWARD_PERC / PERC_BASIS_POINTS;
        rewardToWithdraw += totalReward * vote.tokenWeight /
          (incident.poll.accepted + incident.poll.denied);
      }
    }

    stake.voteRewardCursor = untilIndex > 0 ? untilIndex : uint104(voteCount);
    nxm.mint(user, rewardToWithdraw);
  }

  function withdrawStake (uint112 amount) external onlyMember {
    Stake storage stake = stakeOf[msg.sender];
    uint voteCount = votesOf[msg.sender].length;
    require(stake.amount != 0, "Assessment: No tokens staked");
    uint withdrawableAtTimestamp = votesOf[msg.sender][voteCount - 1].timestamp +
      VOTING_PERIOD_DAYS_MAX + PAYOUT_COOLDOWN_DAYS;
    require(
      _blockTimestamp() > withdrawableAtTimestamp,
      "Assessment: Stake is not withdrawable at the moment"
     );

    nxm.transferFrom(address(this), msg.sender, stake.amount);
    stake.amount = 0;
  }

  function triggerClaimPayout (uint104 claimId) external {
    Claim storage claim = claims[claimId];
    require(
      getPollStatus(EventType.CLAIM, claimId) == PollStatus.ACCEPTED,
      "Assessment: The claim must be accepted"
    );
    require(
      !isInCooldownPeriod(EventType.CLAIM, claimId),
      "Assessment: The claim is in cooldown period"
    );
    require(!claim.details.payoutComplete, "Assessment: Payout was already redeemed");
    claim.details.payoutComplete = true;
    nxm.transferFrom(msg.sender, address(this), claim.details.amount);
  }

  function castVote (EventType eventType, uint104 id, bool accepted) external onlyMember {
    Stake memory stake = stakeOf[msg.sender];
    FraudResolution memory fraudResolution = eventType == EventType.CLAIM
      ? fraudResolutionOfClaim[id]
      : fraudResolutionOfIncident[id];
    Poll storage poll = eventType == EventType.CLAIM
      ? claims[id].poll
      : incidents[id].poll;

    require(stake.amount > 0, "Assessment: A stake is required to cast votes");
    require(
      !fraudResolution.exists && !hasVotingPeriodEnded(eventType, id),
      "Assessment: Voting is closed"
    );
    require(
      poll.accepted > 0 || accepted == true,
      "Assessment: At least one accept vote is required to vote deny"
    );

    if (accepted) {
      if (poll.accepted == 0) {
        poll.voteStart = _blockTimestamp();
      }
      poll.accepted += stake.amount;
    } else {
      poll.denied += stake.amount;
    }

    votesOf[msg.sender].push(Vote(
      id,
      accepted,
      _blockTimestamp(),
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
    uint104 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize
  ) external {
    uint32 blockTimestamp = _blockTimestamp();
    uint voteCount = votesOf[fraudulentAssessor].length;
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
    if (voteBatchSize == 0 || stake.voteRewardCursor + voteBatchSize >= lastFraudulentVoteIndex) {
      processUntil = lastFraudulentVoteIndex + 1;
    } else {
      processUntil = stake.voteRewardCursor + voteBatchSize;
    }

    //console.log("votes %d", voteCount);
    //console.log("voteBatchSize %d", voteBatchSize);
    for (uint j = stake.voteRewardCursor; j < processUntil; j++) {
      Vote memory vote = votesOf[fraudulentAssessor][j];

      //console.log("Index %d", j);
      //console.log("processUntil %d", processUntil);
      //console.log("voteRewardCursor %d", stake.voteRewardCursor);
      FraudResolution storage fraudResolution = vote.eventType == EventType.CLAIM
        ? fraudResolutionOfClaim[vote.eventId]
        : fraudResolutionOfIncident[vote.eventId];
      if (fraudResolution.exists) {
        //console.log("Editing fraudResolution");
        if (vote.accepted == true) {
          fraudResolution.accepted -= vote.tokenWeight;
        } else {
          fraudResolution.denied -= vote.tokenWeight;
        }
      } else {
        uint112 accepted;
        uint112 denied;
        uint32 voteStart;
        uint payoutImpact;
        if (vote.eventType == EventType.CLAIM) {
          Claim memory claim = claims[vote.eventId];
          if (claim.details.payoutComplete) {
            // Once the payout is withdrawn the poll result is final
            continue;
          }
          (accepted, denied, voteStart) = _getPollState(claim.poll);
          payoutImpact = _getPayoutImpactOfClaim(claim);
        } else {
          Incident memory incident = incidents[vote.eventId];
          (accepted, denied, voteStart) = _getPollState(incident.poll);
          payoutImpact = _getPayoutImpactOfIncident(incident);
        }
        uint32 voteEnd = _getVotingPeriodEnd(accepted, denied, voteStart, payoutImpact);
        if (_getEndOfCooldownPeriod(voteEnd) < blockTimestamp) {
          // Once the cooldown period ends the poll result is final
          continue;
        }
        if (vote.accepted) {
          accepted -= vote.tokenWeight;
        } else {
          denied -= vote.tokenWeight;
        }
        //console.log("Creating fraudResolution");
        if (vote.eventType == EventType.CLAIM) {
          fraudResolutionOfClaim[vote.eventId] = FraudResolution( accepted, denied, true);
        } else {
          fraudResolutionOfIncident[vote.eventId] = FraudResolution( accepted, denied, true);
        }
      }
    }

    if (fraudCount == stake.fraudCount) {
      // Burns an assessor only once for each merkle root, no matter how many times this function
      // runs on the same account. When a transaction is too big to fit in one block, it is batched
      // in multiple transactions according to voteBatchSize. After burning the tokens, fraudCount
      // is incremented. If another merkle root is submitted that contains this addres, the leaf
      // should use the updated fraudCount stored in the Stake struct.
      //nxm.burnFrom(assessor, uint(stake.amount));
      stake.amount -= burnAmount;
      stake.fraudCount++;
    }
    stake.voteRewardCursor = uint104(processUntil);
  }

  function updateUintParameters (UintParams[] calldata paramNames, uint[] calldata values) external
  {
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == UintParams.REWARD_PERC) {
        REWARD_PERC = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.FLAT_ETH_FEE_PERC) {
        FLAT_ETH_FEE_PERC = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.INCIDENT_TOKEN_WEIGHT_PERC) {
        INCIDENT_TOKEN_WEIGHT_PERC = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.VOTING_PERIOD_DAYS_MIN) {
        VOTING_PERIOD_DAYS_MIN = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.VOTING_PERIOD_DAYS_MAX) {
        VOTING_PERIOD_DAYS_MAX = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.PAYOUT_COOLDOWN_DAYS) {
        PAYOUT_COOLDOWN_DAYS = uint8(values[i]);
        continue;
      }
    }
  }

  function changeDependentContractAddress() external override {
    // [todo] Since this function is called every time contracts change,
    // all internal contracts could be stored here to avoid calls to master when
    // using onlyInternal or simply making a call to another contract.
    // What I have in mind is that every time this function is called, everything should
    // be wiped out and replaced with what is passed as calldata by master. This function
    // should only be callable by master.
  }

  /* ========== EVENTS ========== */

  event StakeDeposited(address user, uint256 amount);
  event ClaimSubmitted(address user, uint32 coverId, uint24 productId);
  event IncidentSubmitted(address user, uint24 productId);
  event ProofSubmitted(uint indexed coverId, address indexed owner, string ipfsHash);
  event VoteCast(address indexed user, uint256 tokenWeight, bool accepted);
  event RewardWithdrawn(address user, uint256 amount);
  event StakeWithdrawn(address indexed user, uint256 amount);
  event PayoutWithdrawn(address indexed user, uint256 amount);

}
