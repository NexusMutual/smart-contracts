// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IAssessment.sol";
import "hardhat/console.sol";

library AssessmentUtilsLib {
  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint internal constant PERC_BASIS_POINTS = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  function _getPollStatus(IAssessment.Poll memory poll)
  internal view returns (IAssessment.PollStatus) {
    if (block.timestamp < poll.end) {
      return IAssessment.PollStatus.PENDING;
    }
    if (poll.accepted > poll.denied) {
      return IAssessment.PollStatus.ACCEPTED;
    }
    return IAssessment.PollStatus.DENIED;
  }

  function _getPayoutImpactOfClaim (IAssessment.ClaimDetails memory details)
  internal pure returns (uint) {
    return details.amount * PRECISION / details.nxmPriceSnapshot;
  }

  function _getPayoutImpactOfIncident (IAssessment.IncidentDetails memory details)
  internal pure returns (uint) {
    return details.activeCoverAmount * details.impactEstimatePerc / PERC_BASIS_POINTS;
  }

  function _getVoteLockupEndDate (
    IAssessment.Configuration calldata CONFIG,
    IAssessment.Vote memory vote
   ) internal pure returns (uint) {
    return vote.timestamp + CONFIG.MAX_VOTING_PERIOD_DAYS + CONFIG.PAYOUT_COOLDOWN_DAYS;
  }

}
