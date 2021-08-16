// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

interface IAssessment {

  /* ========== DATA STRUCTURES ========== */

  enum ID {TC, MR, P1, TK}

  enum PollStatus { PENDING, ACCEPTED, DENIED }

  enum EventType { CLAIM, INCIDENT }

  enum Asset { ETH, DAI }

  enum UintParams {
    REWARD_PERC,
    INCIDENT_IMPACT_ESTIMATE_PERC,
    MIN_VOTING_PERIOD_DAYS,
    MAX_VOTING_PERIOD_DAYS,
    PAYOUT_COOLDOWN_DAYS,
    CLAIM_ASSESSMENT_DEPOSIT_PERC,
    INCIDENT_ASSESSMENT_DEPOSIT_PERC
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
    uint32 started;
    uint32 ended;
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
   // The asset which is expected at payout. E.g ETH, DAI (See Asset enum)
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

  /*
   *  Keeps details related to incidents.
   */
  struct IncidentDetails {
    // Product identifier
    uint24 productId;
    // Timestamp marking the date of the incident used to verify the user's eligibility for a claim
    // according to their cover period.
    uint32 date;
    // The asset which is expected at payout. E.g ETH, DAI (See Asset enum).
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
