// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/IYieldTokenIncidents.sol";
import "../../interfaces/IAssessment.sol";

import "../../abstract/MasterAwareV2.sol";

contract ASMockYieldTokenIncidents is MasterAwareV2 {

  // Ratios are defined between 0-10000 bps (i.e. double decimal precision percentage)
  uint internal constant REWARD_DENOMINATOR = 10000;
  uint internal constant INCIDENT_EXPECTED_PAYOUT_DENOMINATOR = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  Incident[] public incidents;

  Configuration public config;

  function initialize() external {
    // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.rewardRatio = 52; // 0.52%
    config.expectedPayoutRatio = 3000; // 30%
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date,
    uint96 activeCoverAmountInNXM
  ) external {
    Incident memory incident = Incident(
      0, // assessmentId
      productId,
      date,
      priceBefore
    );

    uint expectedPayoutInNXM = activeCoverAmountInNXM * config.expectedPayoutRatio /
      INCIDENT_EXPECTED_PAYOUT_DENOMINATOR;

    // Determine the total rewards that should be minted for the assessors based on cover period
    uint totalReward = expectedPayoutInNXM * config.rewardRatio / REWARD_DENOMINATOR;
    uint assessmentId = assessment().startAssessment(totalReward, 0);
    incident.assessmentId = uint80(assessmentId);
    incidents.push(incident);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
  }

}
