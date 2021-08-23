// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

interface IAssessment {

  /* ========== DATA STRUCTURES ========== */

  enum PollStatus { PENDING, ACCEPTED, DENIED }

  enum EventType { CLAIM, INCIDENT }

  enum UintParams {
    MIN_VOTING_PERIOD_DAYS,
    MAX_VOTING_PERIOD_DAYS,
    PAYOUT_COOLDOWN_DAYS,
    REWARD_PERC,
    INCIDENT_IMPACT_ESTIMATE_PERC,
    CLAIM_ASSESSMENT_DEPOSIT_PERC,
    INCIDENT_ASSESSMENT_DEPOSIT_PERC
  }

  struct Configuration {
    // The minimum number of days the users can vote on polls
    uint8 MIN_VOTING_PERIOD_DAYS;
    // The maximum number of days the users can vote on polls
    uint8 MAX_VOTING_PERIOD_DAYS;
    // Number of days the users must wait after a poll closes, to redeem payouts.
    uint8 PAYOUT_COOLDOWN_DAYS;
    // Percentage used to calculate assessment rewards (0-10000 i.e. double decimal precision)
    uint16 REWARD_PERC;
    // Percentage used to calculate potential impact of an incident
    uint16 INCIDENT_IMPACT_ESTIMATE_PERC;
    // Percentage out of 1 ETH, used to calculate a flat ETH deposit required for claim submission.
    // If the claim is accepted, the user will receive the deposit back when the payout is redeemed.
    uint16 CLAIM_ASSESSMENT_DEPOSIT_PERC;
    // Percentage used to calculate an NXM deposit required for incident submission. It is only
    // reserved in the eventuality where incidents can be submitted by regular members. This would
    // require them to make a significant NXM deposit to prevent minting unbacked assessment
    // rewards by submitting incidents and denying. Check out git logs on AssessmentIncidentsLib
    // and Assessment.sol for a draft: a45232c2638270c375b445ac301d92cf22bd87e2
    uint16 INCIDENT_ASSESSMENT_DEPOSIT_PERC;

    uint168 _unused;
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
   // A snapshot of CLAIM_ASSESSMENT_DEPOSIT_PERC if it is changed before the payout
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
    // A snapshot of INCIDENT_IMPACT_ESTIMATE_PERC if it changes while voting is still open.
    uint96 activeCoverAmount;
    // A copy of INCIDENT_IMPACT_ESTIMATE_PERC if it changes while voting is still open.
    uint16 impactEstimatePerc;
    // A copy of INCIDENT_ASSESSMENT_DEPOSIT_PERC if it changes while voting is still open.
    uint16 assessmentDepositPerc;
    // True when the assessment deposit has already been redeemed and false otherwise.
    bool depositRedeemed;
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
