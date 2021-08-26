// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";

interface IAssessment is IERC721Receiver {

  /* ========== DATA STRUCTURES ========== */

  enum PollStatus { PENDING, ACCEPTED, DENIED }

  enum EventType { CLAIM, INCIDENT }

  enum UintParams {
    minVotingPeriodDays,
    maxVotingPeriodDays,
    payoutCooldownDays,
    rewardRatio,
    incidentExpectedPayoutRatio,
    claimAssessmentDepositRatio
  }

  struct Configuration {
    // The minimum number of days the users can vote on polls
    uint8 minVotingPeriodDays;

    // The maximum number of days the users can vote on polls
    uint8 maxVotingPeriodDays;

    // Number of days the users must wait after a poll closes, to redeem payouts.
    uint8 payoutCooldownDays;

    // Ratio used to calculate assessment rewards (0-10000 i.e. double decimal precision)
    uint16 rewardRatio;

    // Ratio out of 1 ETH, used to calculate a flat ETH deposit required for claim submission.
    // If the claim is accepted, the user will receive the deposit back when the payout is redeemed.
    uint16 claimAssessmentDepositRatio;

    // Ratio used to calculate potential payout of an incident
    uint16 incidentExpectedPayoutRatio;

    // Ratio used to determine the deductible payout (0-10000 i.e. double decimal precision)
    uint16 incidentPayoutDeductibleRatio;
  }

  struct Stake {
    uint96 amount;
    uint104 rewardsWithdrawnUntilIndex;
    uint16 fraudCount;
    /*uint32 unused,*/
  }

  /*
   *  Holds data for a vote belonging to an assessor.
   *
   *  The structure is used to keep track of user's votes. Each vote is used to determine
   *  a user's share of rewards or to create a fraud resolution which excludes fraudulent votes
   *  from the initial poll.
   */
  struct Vote {
   // Identifier of the claim or incident
    uint104 eventId;
   // If the assessor votes to accept the event it's true otherwise it's false
    bool accepted;
   // Date and time when the vote was cast
    uint32 timestamp;
   // How many tokens were staked when the vote was cast
    uint96 tokenWeight;
   // Can be a claim or an incident (See EventType enum)
    uint8 eventType;
  }

  struct Poll {
    uint96 accepted;
    uint96 denied;
    uint32 start;
    uint32 end;
  }

  /*
   *  Holds the requested amount, NXM price, submission fee and other relevant details
   *  such as parts of the corresponding cover details and the payout status.
   *
   *  This structure has snapshots of claim-time states that are considered moving targets
   *  but also parts of cover details that reduce the need of external calls. Everything is fitted
   *  in a single word that contains:
   */
  struct ClaimDetails {
   // Amount requested as part of this claim up to the total cover amount
    uint96 amount;
   // The identifier of the cover on which this claim is submitted
    uint32 coverId;
   // Cover period represented as days, used to calculate rewards
    uint16 coverPeriod;
   // The index of of the asset address stored at addressOfAsset which is expected at payout.
    uint8 payoutAsset;
   // The price (TWAP) of 1 NXM in the covered asset, at claim-time
    uint80 nxmPriceSnapshot;
   // A snapshot of claimAssessmentDepositRatio if it is changed before the payout
    uint16 assessmentDepositPerc;
   // True when the payout is redeemed. Prevents further payouts on the claim.
    bool payoutRedeemed;
  }

  struct Claim {
    Poll poll;
    ClaimDetails details;
  }

  /*
   *  Keeps details related to incidents.
   */
  struct IncidentDetails {
    // Product identifier
    uint24 productId;
    // Timestamp marking the date of the incident used to verify the user's eligibility for a claim
    // according to their cover period.
    uint32 date;
    // The index of of the asset address stored at addressOfAsset which is expected at payout.
    uint8 payoutAsset;
    // A snapshot of incidentExpectedPayoutRatio if it changes while voting is still open.
    uint96 activeCoverAmount;
    // A copy of incidentExpectedPayoutRatio if it changes while voting is still open.
    uint16 expectedPayoutRatio;
  }

  struct AffectedToken {
    uint96 priceBefore;
    address contractAddress;
  }

  struct Incident {
    Poll poll;
    IncidentDetails details;
  }

  /* ========== VIEWS ========== */

  function claims(uint id) external view returns (Poll memory poll, ClaimDetails memory details);

  function claimants(uint id) external view returns (address);

  function incidents(uint id) external view
  returns (Poll memory poll, IncidentDetails memory details);

  function votesOf(address user, uint id) external view
  returns (uint104 eventId, bool accepted, uint32 timestamp, uint96 tokenWeight, uint8 eventType);

  function stakeOf(address user) external view
  returns (uint96 amount, uint104 rewardsWithdrawnUntilIndex, uint16 fraudCount);

  function hasAlreadyVotedOn(bytes32 voteHash) external view returns (bool);

  function getVoteCountOfAssessor(address assessor) external view returns (uint);

  function getClaimsCount() external view returns (uint);

  function getIncidentsCount() external view returns (uint);

  /* === MUTATIVE FUNCTIONS ==== */

  function submitClaim(
    uint24 coverId,
    uint96 requestedAmount,
    bool hasProof,
    string calldata ipfsProofHash
  ) external payable;

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external;

  function depositStake (uint96 amount) external;

  function withdrawReward (address user, uint104 untilIndex) external;

  function withdrawStake (uint96 amount) external;

  function redeemClaimPayout (uint104 id) external;

  function redeemIncidentPayout (uint104 incidentId, uint32 coverId, uint depeggedTokens) external;

  function castVote (uint8 eventType, uint104 id, bool accepted) external;

  function submitFraud (bytes32 root) external;

  function burnFraud (
    uint256 rootIndex,
    bytes32[] calldata proof,
    address fraudulentAssessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize
  ) external;

  function updateUintParameters (UintParams[] calldata paramNames, uint[] calldata values) external;

  /* ========== EVENTS ========== */

  event StakeDeposited(address user, uint104 amount);
  event ClaimSubmitted(address user, uint104 claimId, uint32 coverId, uint24 productId);
  event IncidentSubmitted(address user, uint104 incidentId, uint24 productId);
  event ProofSubmitted(uint indexed coverId, address indexed owner, string ipfsHash);
  event VoteCast(address indexed user, uint96 tokenWeight, bool accepted);
  event RewardWithdrawn(address user, uint256 amount);
  event StakeWithdrawn(address indexed user, uint96 amount);
  event ClaimPayoutRedeemed(address indexed user, uint256 amount, uint104 claimId);
  event IncidentPayoutRedeemed(address indexed user, uint256 amount, uint104 incidentId, uint24 productId);

}
