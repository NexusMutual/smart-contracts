// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IAssessments.sol";
import "../../generic/AssessmentGeneric.sol";

contract CLMockAssessment is AssessmentGeneric {

  mapping(uint claimId => uint) public _productTypeForClaimId;
  mapping(uint claimId => Assessment) public _assessments;

  function startAssessment(uint claimId, uint productTypeId, uint cooldownPeriod) external override {
    _productTypeForClaimId[claimId] = productTypeId;
    _assessments[claimId] = Assessment({
      assessingGroupId: 1,
      start: uint32(block.timestamp),
      votingEnd: uint32(block.timestamp + 3 days),
      cooldownPeriod: uint32(cooldownPeriod),
      acceptVotes: 0,
      denyVotes: 0
    });
  }

  function getAssessment(uint claimId) external view override returns (Assessment memory assessment) {
    return _assessments[claimId];
  }

  function setAssessment(uint claimId, Assessment memory assessment) external {
    _assessments[claimId] = assessment;
  }

  function setAssessmentForOutcome(uint claimId, AssessmentOutcome desiredOutcome) external {
    Assessment memory assessment;

    // default values for all assessments
    assessment.assessingGroupId = 1;
    assessment.start = uint32(block.timestamp - 100);
    assessment.votingEnd = uint32(block.timestamp - 1); // votingEnd passed
    assessment.cooldownPeriod = 1; // cooldownPeriod passed

    if (desiredOutcome == AssessmentOutcome.ACCEPTED) {
      assessment.acceptVotes = 3;
      assessment.denyVotes = 2;
    } else if (desiredOutcome == AssessmentOutcome.DENIED) {
      assessment.acceptVotes = 2;
      assessment.denyVotes = 3;
    } else if (desiredOutcome == AssessmentOutcome.DRAW) {
      assessment.acceptVotes = 2;
      assessment.denyVotes = 2;
    } else {
      // PENDING - set votingEnd to future or within cooldown
      assessment.votingEnd = uint32(block.timestamp + 1000);
      assessment.cooldownPeriod = 1000;
    }

    _assessments[claimId] = assessment;
  }

  function setAssessmentForStatus(uint claimId, AssessmentStatus desiredStatus) external {
    Assessment memory assessment;

    // default values for all assessments
    assessment.assessingGroupId = 1;
    assessment.start = uint32(block.timestamp - 12 hours);
    assessment.acceptVotes = 3;
    assessment.denyVotes = 2;
    assessment.cooldownPeriod = 1 days;

    if (desiredStatus == AssessmentStatus.VOTING) {
      assessment.votingEnd = uint32(block.timestamp + 1 days);
    } else if (desiredStatus == AssessmentStatus.COOLDOWN) {
      assessment.votingEnd = uint32(block.timestamp - 100);
      assessment.cooldownPeriod = 1 days; // still in cooldown
    } else {
      assessment.votingEnd = uint32(block.timestamp - 2 days);
      assessment.cooldownPeriod = 1 days; // cooldown already passed
    }

    _assessments[claimId] = assessment;
  }
}
