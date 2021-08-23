// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IAssessment.sol";
import "../../libraries/Assessment/AssessmentVoteLib.sol";

/// Used as a helper to test internal view functions of AssessmentVoteLib
contract AssessmentVoteLibTest {

  IAssessment.Claim[] public claims;

  IAssessment.Incident[] public incidents;

  function addClaim (IAssessment.UintParams[] calldata paramNames, uint[] calldata values)
  external {
    // [todo]
  }

  function addIncident (IAssessment.UintParams[] calldata paramNames, uint[] calldata values)
  external {
    // [todo]
  }

  function _getPollStatus(IAssessment.Poll memory poll)
  external view returns (IAssessment.PollStatus) {
    return AssessmentVoteLib._getPollStatus(poll);
  }


  function _getTotalRewardForEvent (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.EventType eventType,
    uint104 id
  ) external view returns (uint) {
    return AssessmentVoteLib._getTotalRewardForEvent(CONFIG, eventType, id, claims, incidents);
  }

  function _calculatePollEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Poll memory poll,
    uint payoutImpact
  ) external pure returns (uint32) {
    return AssessmentVoteLib._calculatePollEndDate(CONFIG, poll, payoutImpact);
  }

}
