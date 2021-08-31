// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";

interface IIncidents {

  /* ========== DATA STRUCTURES ========== */

  enum UintParams {
    incidentExpectedPayoutRatio,
    incidentPayoutDeductibleRatio
  }

  struct Configuration {
    // Ratio used to calculate potential payout of an incident
    // (0-10000 bps i.e. double decimal precision)
    uint16 incidentExpectedPayoutRatio;

    // Ratio used to determine the deductible payout (0-10000 bps i.e. double decimal precision)
    uint16 incidentPayoutDeductibleRatio;
  }

  struct Incident {
    uint80 assessmentId;
    // Product identifier
    uint24 productId;
    // Timestamp marking the date of the incident used to verify the user's eligibility for a claim
    // according to their cover period.
    uint32 date;
    uint96 priceBefore;
  }

  /* ========== VIEWS ========== */

  function incidents(uint id) external view returns (Incident memory incident);

  function getIncidentsCount() external view returns (uint);

  /* === MUTATIVE FUNCTIONS ==== */

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external;

  function redeemIncidentPayout(uint104 incidentId, uint32 coverId, uint depeggedTokens) external;

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values) external;

  /* ========== EVENTS ========== */

  event IncidentSubmitted(address user, uint104 incidentId, uint24 productId);
  event IncidentPayoutRedeemed(address indexed user, uint256 amount, uint104 incidentId, uint24 productId);

}
