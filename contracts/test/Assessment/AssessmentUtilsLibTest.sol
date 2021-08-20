// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IAssessment.sol";
import "../../libraries/Assessment/AssessmentUtilsLib.sol";
import "hardhat/console.sol";

/// Used as a helper to test internal pure and view functions of AssessmentUtilsLibTest
contract AssessmentUtilsLibTest {

  function _getPollStatus(IAssessment.Poll memory poll) external view returns (IAssessment.PollStatus) {
    return AssessmentUtilsLib._getPollStatus(poll);
  }

  function _getPayoutImpactOfClaim (IAssessment.ClaimDetails memory details)
  external pure returns (uint) {
    return AssessmentUtilsLib._getPayoutImpactOfClaim(details);
  }

  function _getPayoutImpactOfIncident (IAssessment.IncidentDetails memory details)
  external pure returns (uint) {
    return AssessmentUtilsLib._getPayoutImpactOfIncident(details);
  }

  function _getVoteLockupEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Vote memory vote
   ) external pure returns (uint) {
    return AssessmentUtilsLib._getVoteLockupEndDate(CONFIG, vote);
  }

}
