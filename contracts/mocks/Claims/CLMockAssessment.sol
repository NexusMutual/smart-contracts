// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IAssessment.sol";
import "../../abstract/MasterAwareV2.sol";

contract CLMockAssessment is IAssessment {

  INXMToken internal immutable nxm;

  /* ========== STATE VARIABLES ========== */

  Configuration public override config;

  // Stake states of users. (See Stake struct)
  mapping(address => Stake) public override stakeOf;

  // Votes of users. (See Vote struct)
  mapping(address => Vote[]) public override votesOf;

  // Mapping used to determine if a user has already voted, using a vote hash as a key
  mapping(address => mapping(uint => bool)) public override hasAlreadyVotedOn;

  // An array of merkle tree roots used to indicate fraudulent assessors. Each root represents a
  // fraud attempt by one or multiple addresses. Once the root is submitted by adivsory board
  // members through governance, burnFraud uses this root to burn the fraudulent assessors' stakes
  // and correct the outcome of the poll.
  bytes32[] internal fraudMerkleRoots;

  // [todo] add comments
  mapping(uint => Poll) internal fraudSnapshot;

  Assessment[] public override assessments;

  /* ========== CONSTRUCTOR ========== */

  constructor(address masterAddress) {
    // [todo] Move to intiialize function
    // The minimum cover premium is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.minVotingPeriodDays = 3; // days
    config.payoutCooldownDays = 1; //days
    master = INXMMaster(masterAddress);
    nxm = INXMToken(master.tokenAddress());
  }

  /* ========== VIEWS ========== */

  function getVoteCountOfAssessor(address assessor) external override view returns (uint) {
    return votesOf[assessor].length;
  }

  function getAssessmentsCount() external override view returns (uint) {
    return assessments.length;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function startAssessment(uint totalAssessmentReward) external
  override returns (uint) {
    assessments.push(Assessment(
      Poll(
        0, // accepted
        0, // denied
        uint32(block.timestamp), // start
        uint32(block.timestamp + config.minVotingPeriodDays * 1 days) // end
      ),
      uint128(totalAssessmentReward)
    ));
    return assessments.length - 1;
  }

  function castVote(uint assessmentId, bool isAccepted) external override {
    if (isAccepted && poll.accepted == 0) {
      // Reset the poll end when the first accepted vote
      poll.end = uint32(block.timestamp + config.minVotingPeriodDays * 1 days);
    }

    // Check if poll ends in less than 24 hours
    if (poll.end - block.timestamp < 1 days) {
      // Extend proportionally to the user's stake but up to 1 day maximum
      poll.end += uint32(min(1 days, 1 days * stake.amount / (poll.accepted + poll.denied)));
    }

    if (isAccepted) {
      poll.accepted += stake.amount;
    } else {
      poll.denied += stake.amount;
    }

    assessments[assessmentId].poll = poll;

    votesOf[msg.sender].push(Vote(
      uint80(assessmentId),
      isAccepted,
      uint32(block.timestamp),
      stake.amount
    ));
  }
}
