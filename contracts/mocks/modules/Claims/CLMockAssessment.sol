// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/INXMToken.sol";
import "../../../interfaces/ITokenController.sol";
import "../../../interfaces/IAssessment.sol";
import "../../../abstract/MasterAwareV2.sol";
import "../../generic/AssessmentGeneric.sol";

contract CLMockAssessment is AssessmentGeneric {

  /* ========== STATE VARIABLES ========== */

  bytes32[] internal fraudMerkleRoots;

  mapping(uint => IAssessment.Poll) internal fraudSnapshot;

  /* ========== CONSTRUCTOR ========== */

  constructor() {
    config.minVotingPeriodInDays = 3; // days
    config.payoutCooldownInDays = 1; //days
  }

  /* ========== VIEWS ========== */

  function min(uint a, uint b) internal pure returns (uint) {
    return a <= b ? a : b;
  }

  function getVoteCountOfAssessor(address assessor) external override view returns (uint) {
    return votesOf[assessor].length;
  }

  function getAssessmentsCount() external override view returns (uint) {
    return assessments.length;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function startAssessment(uint totalAssessmentReward, uint assessmentDeposit) external override
  returns (uint) {
    assessments.push(IAssessment.Assessment(
      IAssessment.Poll(
        0, // accepted
        0, // denied
        uint32(block.timestamp), // start
        uint32(block.timestamp + uint(config.minVotingPeriodInDays) * 1 days) // end
      ),
      uint128(totalAssessmentReward),
      uint128(assessmentDeposit)
    ));
    return assessments.length - 1;
  }

  function getPoll(uint assessmentId) external override view returns (IAssessment.Poll memory) {
    return assessments[assessmentId].poll;
  }


  function castVote(uint assessmentId, bool isAcceptVote, uint96 stakeAmount) external {
    IAssessment.Poll memory poll = assessments[assessmentId].poll;

    if (isAcceptVote && poll.accepted == 0) {
      // Reset the poll end when the first accepted vote
      poll.end = uint32(block.timestamp + uint(config.minVotingPeriodInDays) * 1 days);
    }

    // Check if poll ends in less than 24 hours
    if (poll.end - block.timestamp < 1 days) {
      // Extend proportionally to the user's stake but up to 1 day maximum
      poll.end += uint32(min(1 days, 1 days * stakeAmount / (poll.accepted + poll.denied)));
    }

    if (isAcceptVote) {
      poll.accepted += stakeAmount;
    } else {
      poll.denied += stakeAmount;
    }

    assessments[assessmentId].poll = poll;

    votesOf[msg.sender].push(IAssessment.Vote(
      uint80(assessmentId),
      isAcceptVote,
      uint32(block.timestamp),
      stakeAmount
    ));
  }
}
