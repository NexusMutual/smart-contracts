// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";

interface IAssessment is IERC721Receiver {

  /* ========== DATA STRUCTURES ========== */

  enum PollStatus { PENDING, ACCEPTED, DENIED }

  enum UintParams {
    minVotingPeriodDays,
    stakeLockupPeriodDays,
    payoutCooldownDays
  }

  struct Configuration {
    // The minimum number of days the users can vote on polls
    uint8 minVotingPeriodDays;
    // Number of days the users must wait from their last vote, to withdraw their stake.
    uint8 stakeLockupPeriodDays;
    // Number of days the users must wait after a poll closes, to redeem payouts.
    uint8 payoutCooldownDays;
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
  }

  struct Poll {
    uint96 accepted;
    uint96 denied;
    uint32 start;
    uint32 end;
  }

  struct Assessment {
    Poll poll;
    uint128 totalReward;
  }

  /* ========== VIEWS ========== */

  function getAssessmentsCount() external view returns (uint);

  function getVoteCountOfAssessor(address assessor) external view returns (uint);

  function votesOf(address user, uint id) external view
  returns (uint104 eventId, bool accepted, uint32 timestamp, uint96 tokenWeight, uint8 eventType);

  function stakeOf(address user) external view
  returns (uint96 amount, uint104 rewardsWithdrawnUntilIndex, uint16 fraudCount);

  function config() external view
  returns (uint8 minVotingPeriodDays, uint8 stakeLockupPeriodDays, uint8 payoutCooldownDays);

  function hasAlreadyVotedOn(address voter, uint pollId) external view returns (bool);


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

  function depositStake(uint96 amount) external;

  function withdrawReward(address user, uint104 untilIndex) external
  returns (uint withdrawn, uint104 withdrawUntilIndex);

  function withdrawStake(uint96 amount) external;

  function startAssessment(uint totalAssessmentReward) external returns (uint);

  function redeemClaimPayout(uint104 id) external;

  function redeemCoverForDeniedClaim(uint coverId, uint claimId) external;

  function redeemIncidentPayout(uint104 incidentId, uint32 coverId, uint depeggedTokens) external;

  function castVote(uint8 eventType, uint104 id, bool accepted) external;

  function submitFraud(bytes32 root) external;

  function burnFraud(
    uint256 rootIndex,
    bytes32[] calldata proof,
    address fraudulentAssessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize
  ) external;

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values) external;

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
