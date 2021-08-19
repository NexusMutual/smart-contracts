// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "./AssessmentUtilsLib.sol";


library AssessmentIncidentsLib {
  // Percentages are defined between 0-10000 i.e. double decimal precision
  uint16 internal constant PERC_BASIS_POINTS = 10000;

  // [todo] In case of duplicate incidents, allow an incident to be marked as duplicate by the
  // proponent. They will need to provide an id which will compare productId, date, and priceBefore
  // within certain tolerated ranges and if the two match, it allows the proponent to withdraw
  // their deposit and transition the incident to a final state.

  function releaseIncidentAssessmentDeposit (
    uint104 id,
    IAssessment.Incident[] storage incidents,
    INXMToken nxm
  ) external {
    //IAssessment.Incident memory incident = incidents[id];

    //require(block.timestamp >= incident.poll.end, "The incident is in cooldown period");

    //uint16 assessmentDepositPerc = incident.details.assessmentDepositPerc;
    //require(assessmentDepositPerc > 0, "Incident did not require an assessment deposit");

    //IAssessment.PollStatus status = IAssessment._getPollStatus(incident.poll);
    //uint payoutImpact = IAssessment._getPayoutImpactOfIncident(incident);
    //uint deposit = payoutImpact * assessmentDepositPerc / PERC_BASIS_POINTS;

    //require(incident.details.depositRedeemed, "Assessment deposit was already redeemed");
    //incidents[id].details.depositRedeemed = true;
    //if (status == IAssessment.PollStatus.ACCEPTED) {
      //nxm.transferFrom(address(this), incidentProponent[id], deposit);
    //}
    //if (status == IAssessment.PollStatus.DENIED) {
      //nxm.burn(deposit);
    //}
  }

  function getIncidentToSubmit(
    IAssessment.Configuration calldata CONFIG,
    INXMToken nxm,
    IMemberRoles memberRoles,
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external returns (IAssessment.AffectedToken memory, IAssessment.Incident memory) {
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

    uint payoutImpact = AssessmentUtilsLib._getPayoutImpactOfIncident(incident.details);
    incident.poll.end = AssessmentUtilsLib._calculatePollEndDate(CONFIG, incident.poll, payoutImpact);


    if (CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC > 0) {
      uint deposit = payoutImpact * CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC / PERC_BASIS_POINTS;
      nxm.transferFrom(msg.sender, address(this), deposit);
    }

    IAssessment.AffectedToken memory affectedToken = IAssessment.AffectedToken(priceBefore, tokenAddress);

    return (affectedToken, incident);
  }

  function saveIncident (
    IAssessment.Incident calldata incident,
    IAssessment.Incident[] storage incidents,
    IAssessment.AffectedToken calldata affectedToken,
    mapping(uint104 => IAssessment.AffectedToken) storage tokenAffectedByIncident,
    mapping(uint104 => address) storage incidentProponent
  ) external {
    uint104 nextId = uint104(incidents.length);
    tokenAffectedByIncident[nextId] = affectedToken;
    incidentProponent[nextId] = msg.sender;
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
