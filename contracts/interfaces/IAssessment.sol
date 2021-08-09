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
    INCIDENT_TOKEN_WEIGHT_PERC,
    VOTING_PERIOD_DAYS_MIN,
    VOTING_PERIOD_DAYS_MAX,
    PAYOUT_COOLDOWN_DAYS,
    CLAIM_FEE_PERC,
    INCIDENT_FEE_PERC
  }

  struct Stake {
    uint104 amount;
    uint104 voteRewardCursor;
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
   // Can be either a claimId or an IncidentId
    uint104 eventId;
   // If the assessor voted to accept the event it's true otherwise it's false
    bool accepted;
   // Date and time when the vote was cast
    uint32 timestamp;
   // How many tokens were staked when the vote was cast
    uint104 tokenWeight;
   // Can be a claim or an incident (See EventType enum)
    EventType eventType;
  }

  struct Poll {
    uint112 accepted;
    uint112 denied;
    uint32 voteStart;
  }

  /*
   *  Holds the requested amount, NXM price, submission fee and other relevant details
   *  such as parts of the corresponding cover details and the payout status.
   *
   *  dev This structure has snapshots of claim-time states that are considered moving targets
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
   // A snapshot of FLAT_ETH_FEE_PERC if it is changed before the payout
    uint16 flatEthFeePerc;
   // True when the payout is complete. Prevents further payouts on the claim.
    bool payoutComplete;
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
    uint voteStart;
    uint voteEnd;
    string claimStatus;
    string payoutStatus;
  }

  /**
   *  Keeps details related to incidents.
   *
   *  Contains aggregated values that give an overall view about the claim and other relevant
   *  pieces of information such as cover period, asset symbol etc. This structure is not used in
   *  any storage variables.
   */
  struct IncidentDetails {
    // Product identifier
    uint24 productId;
    // Timestamp marking the date of the incident used to verify the user's eligibility for a claim
    // according to their cover period
    uint32 date;
    // The asset which is expected at payout. E.g ETH, DAI (See Asset enum)
    uint8 payoutAsset;
    uint96 activeCoverAmount;
   // The price (TWAP) of 1 NXM in the covered asset, at claim-time
    uint80 nxmPriceSnapshot;
  }

  struct TokenSnapshot {
    uint96 priceBefore;
    address contractAddress;
  }

  struct Incident {
    Poll poll;
    IncidentDetails details;
    TokenSnapshot tokenSnapshot;
  }

  struct FraudResolution {
    uint112 accepted;
    uint112 denied;
    uint32 timestamp;
  }

  /* ========== VIEWS ========== */

  /* === MUTATIVE FUNCTIONS ==== */

  /* ========== EVENTS ========== */

  event StakeDeposited(address user, uint104 amount);
  event ClaimSubmitted(address user, uint104 claimId, uint32 coverId, uint24 productId);
  event IncidentSubmitted(address user, uint104 incidentId, uint24 productId);
  event ProofSubmitted(uint indexed coverId, address indexed owner, string ipfsHash);
  event VoteCast(address indexed user, uint256 tokenWeight, bool accepted);
  event RewardWithdrawn(address user, uint256 amount);
  event StakeWithdrawn(address indexed user, uint112 amount);
  event ClaimPayoutRedeemed(address indexed user, uint256 amount, uint104 claimId);
  event IncidentPayoutRedeemed(address indexed user, uint256 amount, uint104 incidentId, uint24 productId);

}
