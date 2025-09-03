// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../interfaces/IAssessments.sol";

library AssessmentLib {

  function getStatus(Assessment memory assessment) internal view returns(AssessmentStatus) {
    if (block.timestamp < assessment.votingEnd) {
      return AssessmentStatus.VOTING;
    }

    if (block.timestamp <= assessment.votingEnd + assessment.cooldownPeriod) {
      return AssessmentStatus.COOLDOWN;
    }

    return AssessmentStatus.FINALIZED;
  }

  function getOutcome(Assessment memory assessment) internal view returns(AssessmentOutcome) {
    if (block.timestamp <= assessment.votingEnd + assessment.cooldownPeriod) {
      return AssessmentOutcome.PENDING;
    }

    // Cooldown has passed, the assessment can have a final decision
    if (assessment.acceptVotes > assessment.denyVotes) {
      return AssessmentOutcome.ACCEPTED;
    }

    if (assessment.acceptVotes < assessment.denyVotes) {
      return AssessmentOutcome.DENIED;
    }

    return AssessmentOutcome.DRAW;
  }

}

