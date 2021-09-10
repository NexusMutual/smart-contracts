// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/IMasterAwareV2.sol";
import "../../libraries/Assessment/AssessmentVoteLib.sol";

library AssessmentIncidentsLib {
  // Ratios are defined between 0-10000 bps (i.e. double decimal precision percentage)
  uint internal constant RATIO_BPS = 10000;

  function _getExpectedIncidentPayoutNXM (IAssessment.IncidentDetails memory details)
  internal pure returns (uint) {
    return details.activeCoverAmount * details.expectedPayoutRatio / RATIO_BPS;
  }

  function getIncidentToSubmit(
    IAssessment.Configuration calldata config,
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
    uint8 payoutAsset = 0; // take this form product
    address tokenAddress = 0x0000000000000000000000000000000000000000;

    IAssessment.Incident memory incident = IAssessment.Incident(
      IAssessment.Poll(0,0,uint32(block.timestamp), 0),
      IAssessment.IncidentDetails(
        productId,
        date,
        payoutAsset,
        activeCoverAmount, // NXM
        config.incidentExpectedPayoutRatio
      )
    );

    incident.poll.end = incident.poll.start + config.minVotingPeriodDays * 1 days;

    IAssessment.AffectedToken memory affectedToken = IAssessment.AffectedToken(priceBefore, tokenAddress);

    return (affectedToken, incident);
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
    mapping(uint => address payable) storage internalContracts,
    IAssessment.Incident calldata incident,
    uint32 coverId,
    uint depeggedTokens
  ) external {

    require(
      AssessmentVoteLib._getPollStatus(incident.poll) == IAssessment.PollStatus.ACCEPTED,
      "The incident must be accepted"
    );

    require(block.timestamp >= incident.poll.end, "The incident is in cooldown period");

    address payable coverOwner;
    uint payoutAmount;
    {
      ICover coverContract = ICover(internalContracts[uint(IMasterAwareV2.ID.CO)]);
      coverOwner = payable(coverContract.ownerOf(coverId));
      (
        uint24 productId,
        /*uint8 payoutAsset*/,
        uint96 amount,
        uint32 start,
        uint32 period,
      ) = coverContract.covers(coverId);

      require (coverOwner == msg.sender, "Payout can only be redeemed by cover owner");
      require(productId == incident.details.productId, "Product id mismatch");
      require(start <= incident.details.date, "Cover start date is after the incident");
      require(start + period >= incident.details.date, "Cover end date is before the incident");
      uint gracePeriod = 0; // [todo] Get from product
      require(start + period + gracePeriod >= block.timestamp, "Grace period has expired");
      // Should BURN_RATIO & DEDUCTIBLE_RATIO be stored in product details?
      payoutAmount = depeggedTokens; // [todo] Calculate payout amount
      require(payoutAmount <= amount, "Payout exceeds covered amount");
      coverContract.performPayoutBurn(coverId, coverOwner, payoutAmount);
    }


    // [todo] Replace payoutAddress with the member's address using the member id
    address payable payoutAddress;
    {
      IMemberRoles memberRolesContract = IMemberRoles(internalContracts[uint(IMasterAwareV2.ID.MR)]);
      payoutAddress = memberRolesContract.getClaimPayoutAddress(coverOwner);
    }

    {
      IPool poolContract = IPool(internalContracts[uint(IMasterAwareV2.ID.P1)]);
      address asset = poolContract.assets(incident.details.payoutAsset); // [todo]
      bool succeeded = poolContract.sendClaimPayout(asset, payoutAddress, payoutAmount);
      require(succeeded, "Incident payout failed");
    }
  }
}
