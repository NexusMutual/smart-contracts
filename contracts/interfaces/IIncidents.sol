// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IIncidents {

  /* ========== DATA STRUCTURES ========== */

  enum IncidentStatus { PENDING, ACCEPTED, DENIED, EXPIRED }

  enum UintParams {
    payoutRedemptionPeriodInDays,
    expectedPayoutRatio,
    payoutDeductibleRatio,
    maxRewardInNXMWad,
    rewardRatio
  }

  struct Permit {
    address owner;
    address spender;
    uint256 value;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  struct Configuration {
    // Number of days in which payouts can be redeemed
    uint8 payoutRedemptionPeriodInDays;

    // Ratio used to calculate potential payout of an incident
    // (0-10000 bps i.e. double decimal precision)
    uint16 expectedPayoutRatio;

    // Ratio used to determine the deductible payout (0-10000 bps i.e. double decimal precision)
    uint16 payoutDeductibleRatio;

    // An amount of NXM representing the maximum reward amount given for any claim assessment.
    uint16 maxRewardInNXMWad;

    // Ratio used to calculate assessment rewards (0-10000 i.e. double decimal precision)
    uint16 rewardRatio;
  }

  struct Incident {
    uint80 assessmentId;

    // Product identifier
    uint24 productId;

    // Timestamp marking the date of the incident used to verify the user's eligibility for a claim
    // according to their cover period.
    uint32 date;

    // The price of the depegged token before the incident that resulted in the depeg.
    uint96 priceBefore;
  }

  struct IncidentDisplay {
    uint id;
    uint productId;
    uint priceBefore;
    uint incidentDate;
    uint pollStart;
    uint pollEnd;
    uint redeemableUntil;
    uint status;
  }

  /* ========== VIEWS ========== */

  function config() external view returns (
    uint8 payoutRedemptionPeriodInDays,
    uint16 expectedPayoutRatio,
    uint16 payoutDeductibleRatio,
    uint16 maxRewardInNXMWad,
    uint16 rewardRatio
  );

  function incidents(uint id) external view
  returns (uint80 assessmentId, uint24 productId, uint32 date, uint96 priceBefore);

  function getIncidentsCount() external view returns (uint);

  /* === MUTATIVE FUNCTIONS ==== */

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date,
    uint expectedPayoutInNXM,
    string calldata ipfsMetadata
  ) external;

  function redeemPayoutWithPermit(
    uint104 incidentId,
    uint32 coverId,
    uint segmentId,
    uint depeggedTokens,
    address payable payoutAddress,
    address coveredToken,
    Permit calldata permit
  ) external returns (uint payoutAmount, uint8 payoutAsset);

  function redeemPayout(
    uint104 incidentId,
    uint32 coverId,
    uint segmentId,
    uint depeggedTokens,
    address payable payoutAddress
  ) external returns (uint payoutAmount, uint8 payoutAsset);

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values) external;

  /* ========== EVENTS ========== */

  event IncidentSubmitted(address user, uint104 incidentId, uint24 productId);
  event MetadataSubmitted(uint indexed incidentId, uint expectedPayoutInNXM, string ipfsMetadata);
  event IncidentPayoutRedeemed(address indexed user, uint256 amount, uint104 incidentId, uint24 productId);

}
