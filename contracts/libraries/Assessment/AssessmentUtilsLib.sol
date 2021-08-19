// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IAssessment.sol";
import "hardhat/console.sol";

library AssessmentUtilsLib {
  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint16 internal constant PERC_BASIS_POINTS = 10000;

  function abs(int x) internal pure returns (int) {
    return x >= 0 ? x : -x;
  }

  function min(uint a, uint b) internal pure returns (uint) {
    return a <= b ? a : b;
  }

  function pollFraudExists(IAssessment.Poll memory poll) internal pure returns (bool) {
    return poll.start > 0;
  }

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  function _getPollStatus(IAssessment.Poll memory poll) internal view returns (IAssessment.PollStatus) {
    if (block.timestamp < poll.end) {
      return IAssessment.PollStatus.PENDING;
    }

    if (poll.accepted > poll.denied) {
      return IAssessment.PollStatus.ACCEPTED;
    } else {
      return IAssessment.PollStatus.DENIED;
    }
  }

  function _getPayoutImpactOfClaim (IAssessment.Claim memory claim) internal pure returns (uint) {
    return claim.details.amount * PRECISION / claim.details.nxmPriceSnapshot;
  }

  function _getPayoutImpactOfIncident (IAssessment.Incident memory incident) internal pure returns (uint) {
    uint96 activeCoverAmount = incident.details.activeCoverAmount;
    uint16 impactEstimatePerc = incident.details.impactEstimatePerc;
    return activeCoverAmount * impactEstimatePerc / PERC_BASIS_POINTS;
  }

  function _getVoteLockupEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Vote memory vote
   ) internal pure returns (uint) {
    return vote.timestamp + CONFIG.MAX_VOTING_PERIOD_DAYS + CONFIG.PAYOUT_COOLDOWN_DAYS;
  }

  function _getCooldownEndDate (
    IAssessment.Configuration calldata CONFIG,
    uint32 pollEnd
  ) internal pure returns (uint32) {
    return pollEnd + CONFIG.PAYOUT_COOLDOWN_DAYS * 1 days;
  }

  function _calculatePollEndDate (
    IAssessment.Configuration calldata CONFIG,
    uint96 accepted,
    uint96 denied,
    uint32 start,
    uint payoutImpact
  ) internal pure returns (uint32) {
    if (accepted == 0 && denied == 0) {
      return uint32(start + CONFIG.MIN_VOTING_PERIOD_DAYS * 1 days);
    }

    uint consensusDrivenStrength = uint(
      abs(int(2 * accepted * PRECISION / (accepted + denied)) - int(PRECISION))
    );
    uint tokenDrivenStrength = min((accepted + denied) * PRECISION / payoutImpact, 10 * PRECISION) / 10;

    return uint32(start + CONFIG.MIN_VOTING_PERIOD_DAYS * 1 days +
      (1 * PRECISION - min(consensusDrivenStrength,  tokenDrivenStrength)) *
      (CONFIG.MAX_VOTING_PERIOD_DAYS * 1 days - CONFIG.MIN_VOTING_PERIOD_DAYS * 1 days) / PRECISION);
  }

  function _calculatePollEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Poll memory poll,
    uint payoutImpact
  ) internal pure returns (uint32) {
    return _calculatePollEndDate(CONFIG, poll.accepted, poll.denied, poll.start, payoutImpact);
  }

}
