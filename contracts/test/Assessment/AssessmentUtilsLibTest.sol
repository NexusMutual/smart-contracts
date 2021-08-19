// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IAssessment.sol";
import "../../libraries/Assessment/AssessmentUtilsLib.sol";
import "hardhat/console.sol";

/// Used as a helper to test internal pure and view functions of AssessmentUtilsLibTest
contract AssessmentUtilsLibTest {

  function abs(int x) external pure returns (int) {
    return AssessmentUtilsLib.abs(x);
  }

  function min(uint a, uint b) external pure returns (uint) {
    return AssessmentUtilsLib.min(a, b);
  }

  function pollFraudExists(IAssessment.Poll memory poll) external pure returns (bool) {
    return AssessmentUtilsLib.pollFraudExists(poll);
  }

  function _getPollStatus(IAssessment.Poll memory poll) external view returns (IAssessment.PollStatus) {
    return AssessmentUtilsLib._getPollStatus(poll);
  }

  function _getPayoutImpactOfClaim (IAssessment.Claim memory claim) external pure returns (uint) {
    return AssessmentUtilsLib._getPayoutImpactOfClaim(claim);
  }

  function _getPayoutImpactOfIncident (IAssessment.Incident memory incident) external pure returns (uint) {
    return AssessmentUtilsLib._getPayoutImpactOfIncident(incident);
  }

  function _getVoteLockupEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Vote memory vote
   ) external pure returns (uint) {
    return AssessmentUtilsLib._getVoteLockupEndDate(CONFIG, vote);
  }

  function _getCooldownEndDate (
    IAssessment.Configuration calldata CONFIG,
    uint32 pollEnd
  ) external pure returns (uint32) {
    return AssessmentUtilsLib._getCooldownEndDate(CONFIG, pollEnd);
  }

  function _calculatePollEndDate (
    IAssessment.Configuration calldata CONFIG,
    uint96 accepted,
    uint96 denied,
    uint32 start,
    uint payoutImpact
  ) external pure returns (uint32) {
    return AssessmentUtilsLib._calculatePollEndDate(CONFIG, accepted, denied, start, payoutImpact);
  }

  function _calculatePollEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Poll memory poll,
    uint payoutImpact
  ) external pure returns (uint32) {
    return AssessmentUtilsLib._calculatePollEndDate(CONFIG, poll, payoutImpact);
  }

}
