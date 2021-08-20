// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "./AssessmentUtilsLib.sol";


library AssessmentIncidentsLib {
  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint internal constant PERC_BASIS_POINTS = 10000;

  function getIncidentToSubmit(
    IAssessment.Configuration calldata CONFIG,
    IMemberRoles memberRoles,
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external view returns (IAssessment.AffectedToken memory, IAssessment.Incident memory) {
    require(
      memberRoles.checkRole(msg.sender, uint(IMemberRoles.Role.AdvisoryBoard)),
      "Caller must be an advisory board member"
    );
    uint96 activeCoverAmount = 20000 ether; // NXM, since this will be driven by capacity
    uint8 payoutAsset = uint8(IAssessment.Asset.ETH); // take this form product
    address tokenAddress = 0x0000000000000000000000000000000000000000;

    IAssessment.Incident memory incident = IAssessment.Incident(
      IAssessment.Poll(0,0,uint32(block.timestamp), 0),
      IAssessment.IncidentDetails(
        productId,
        date,
        payoutAsset,
        activeCoverAmount, // NXM
        CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC,
        CONFIG.INCIDENT_IMPACT_ESTIMATE_PERC,
        false
      )
    );

    incident.poll.end = incident.poll.start + CONFIG.MIN_VOTING_PERIOD_DAYS * 1 days;

    IAssessment.AffectedToken memory affectedToken = IAssessment.AffectedToken(priceBefore, tokenAddress);

    return (affectedToken, incident);
  }

  function returnIncidentDeposit(
    IAssessment.Configuration calldata CONFIG,
    INXMToken nxm,
    IAssessment.Incident calldata incident
  ) external {
    if (CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC > 0) {
      uint payoutImpact = AssessmentUtilsLib._getPayoutImpactOfIncident(incident.details);
      uint deposit = payoutImpact * CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC / PERC_BASIS_POINTS;
      nxm.transferFrom(msg.sender, address(this), deposit);
    }
  }

  function saveIncident (
    IAssessment.Incident calldata incident,
    IAssessment.Incident[] storage incidents,
    IAssessment.AffectedToken calldata affectedToken,
    mapping(uint104 => IAssessment.AffectedToken) storage tokenAffectedByIncident
  ) external {
    uint104 nextId = uint104(incidents.length);
    tokenAffectedByIncident[nextId] = affectedToken;
    incidents.push(incident);
  }

  function redeemIncidentPayout (
    IPool pool,
    IMemberRoles memberRoles,
    IAssessment.Incident calldata incident,
    uint32 coverId,
    uint payoutAmount,
    mapping(uint => address) storage addressOfAsset
  ) external {
    // [todo] Read the owner from the cover
    address payable coverOwner = payable(0x0000000000000000000000000000000000000000);
    require (coverOwner == msg.sender, "Payout can only be redeemed by cover owner");
    // [todo] Read and verify details from cover
    require(
      AssessmentUtilsLib._getPollStatus(incident.poll) == IAssessment.PollStatus.ACCEPTED,
      "The incident must be accepted"
    );
    require(
      block.timestamp >= incident.poll.end,
      "The incident is in cooldown period"
    );
    // [todo] Destroy and create a new cover nft
    address payable payoutAddress = memberRoles.getClaimPayoutAddress(coverOwner);
    address coverAsset = addressOfAsset[uint(IAssessment.Asset.ETH)]; // [todo]
    bool succeeded = pool.sendClaimPayout(coverAsset, payoutAddress, payoutAmount);
    require(succeeded, "Incident payout failed");
  }
}
