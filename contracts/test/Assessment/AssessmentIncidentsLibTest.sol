// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "../../libraries/Assessment/AssessmentIncidentsLib.sol";

contract AssessmentIncidentsLibTest {
  function _getPayoutImpactOfIncident (IAssessment.IncidentDetails memory details)
  external pure returns (uint) {
    return AssessmentIncidentsLib._getPayoutImpactOfIncident(details);
  }
}
