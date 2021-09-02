// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/IIncidents.sol";

import "../../libraries/AssessmentLib.sol";

import "../../abstract/MasterAwareV2.sol";

/**
 *  Provides a way for cover owners to submit claims and redeem the payouts and facilitates
 *  assessment processes where members decide the outcome of the events that lead to potential
 *  payouts.
 */
contract Incidents is IIncidents, MasterAwareV2 {

  // Ratios are defined between 0-10000 bps (i.e. double decimal precision percentage)
  uint internal constant RATIO_BPS = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  /* ========== STATE VARIABLES ========== */

  INXMToken internal immutable nxm;

  Configuration public override config;

  Incident[] public override incidents;

  /* ========== CONSTRUCTOR ========== */

  constructor(address nxmAddress) {
    nxm = INXMToken(nxmAddress);
  }

  function initialize(address masterAddress) external {
    // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.rewardRatio = 52; // 0.52%
    config.incidentExpectedPayoutRatio = 3000; // 30%
    config.incidentPayoutDeductibleRatio = 9000; // 90%
    master = INXMMaster(masterAddress);
  }

  /* ========== VIEWS ========== */

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(IMasterAwareV2.ID.MR)]);
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  function getIncidentsCount() external override view returns (uint) {
    return incidents.length;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external override {
    require(
      memberRoles().checkRole(msg.sender, uint(IMemberRoles.Role.AdvisoryBoard)),
      "Caller must be an advisory board member"
    );
    // [todo] Should this be read from Cover.sol?
    uint96 activeCoverAmount = 20000 ether; // NXM, since this will be driven by capacity

    Incident memory incident = Incident(
      0, // assessmentId
      productId,
      date,
      priceBefore
    );

    // Calculate the expected in NXM using the NXM price at cover purchase time
    uint expectedPayoutNXM = activeCoverAmount * config.incidentExpectedPayoutRatio *
      PRECISION / RATIO_BPS;

    // Determine the total rewards that should be minted for the assessors based on cover period
    uint totalReward = expectedPayoutNXM * config.rewardRatio * RATIO_BPS;
    uint assessmentId = assessment().startAssessment(totalReward, 0);
    incident.assessmentId = uint80(assessmentId);
    incidents.push(incident);
  }

  function redeemIncidentPayout(uint104 incidentId, uint32 coverId, uint depeggedTokens)
  external override onlyMember {
    Incident memory incident =  incidents[incidentId];
    (IAssessment.Poll memory poll,,) = assessment().assessments(incident.assessmentId);

    require(
      AssessmentLib._getPollStatus(poll) == IAssessment.PollStatus.ACCEPTED,
      "The incident must be accepted"
    );

    (,,uint8 payoutCooldownDays) = assessment().config();
    require(
      block.timestamp >= poll.end + payoutCooldownDays * 1 days,
     "The incident is in cooldown period"
    );

    address payable coverOwner;
    uint payoutAmount;
    uint8 payoutAsset;
    {
      ICover coverContract = ICover(getInternalContractAddress(ID.CO));
      coverOwner = payable(coverContract.ownerOf(coverId));

      uint24 productId;
      uint96 amount;
      uint32 start;
      uint32 period;
      (
        productId,
        amount,
        start,
        period,
        payoutAsset,
        ,
      ) = coverContract.covers(coverId);
      payoutAmount = depeggedTokens; // [todo] Calculate payout amount
      require(payoutAmount <= amount, "Payout exceeds covered amount");
      coverContract.performPayoutBurn(coverId, coverOwner, payoutAmount);

      require (coverOwner == msg.sender, "Payout can only be redeemed by cover owner");
      require(productId == incident.productId, "Product id mismatch");
      require(start <= incident.date, "Cover start date is after the incident");
      require(start + period >= incident.date, "Cover end date is before the incident");
      uint gracePeriod = 0; // [todo] Get from product
      require(start + period + gracePeriod >= block.timestamp, "Grace period has expired");
      // Should BURN_RATIO & DEDUCTIBLE_RATIO be stored in product details?
    }


    // [todo] Replace payoutAddress with the member's address using the member id
    address payable payoutAddress = memberRoles().getClaimPayoutAddress(coverOwner);

    {
      IPool poolContract = IPool(internalContracts[uint(IMasterAwareV2.ID.P1)]);
      bool succeeded = poolContract.sendClaimPayout(payoutAsset, payoutAddress, payoutAmount);
      require(succeeded, "Incident payout failed");
    }
  }

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values)
  external override onlyGovernance {
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == UintParams.rewardRatio) {
        newConfig.rewardRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.incidentExpectedPayoutRatio) {
        newConfig.incidentExpectedPayoutRatio = uint16(values[i]);
        continue;
      }
    }
    config = newConfig;
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
  }

  // Required to receive NFTS
  function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
  external pure override returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }

}
