// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IAssessment.sol";
import "../../libraries/Assessment/AssessmentVoteLib.sol";
import "../../libraries/Assessment/AssessmentGovernanceActionsLib.sol";

/// Used as a helper to test internal view functions of AssessmentVoteLib
contract AssessmentVoteLibTest is IAssessment{

  Claim[] public override claims;

  Incident[] public override incidents;

  function addClaim (UintParams[] calldata paramNames, uint[] calldata values)
  external {
    // [todo]
  }

  function addIncident (UintParams[] calldata paramNames, uint[] calldata values)
  external {
    // [todo]
  }

  function _getTotalRewardForEvent (Configuration CONFIG, EventType eventType, uint104 id)
  external view returns (uint) {
    return AssessmentVoteLib._getTotalRewardForEvent(CONFIG, eventType, id, claims, incidents);
  }

}
