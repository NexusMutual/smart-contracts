// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/IIncidents.sol";
import "../../interfaces/ICoverNFT.sol";

import "../../abstract/MasterAwareV2.sol";

/**
 *  Provides a way for cover owners to submit claims and redeem the payouts and facilitates
 *  assessment processes where members decide the outcome of the events that lead to potential
 *  payouts.
 */
contract Incidents is IIncidents, MasterAwareV2 {

  // Ratios are defined between 0-10000 bps (i.e. double decimal precision percentage)
  uint internal constant REWARD_DENOMINATOR = 10000;
  uint internal constant INCIDENT_EXPECTED_PAYOUT_DENOMINATOR = 10000;
  uint internal constant INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR = 10000;

  // Used in operations involving NXM tokens and divisions
  uint internal constant PRECISION = 10 ** 18;

  INXMToken internal immutable nxm;

  ICoverNFT internal immutable coverNFT;

  /* ========== STATE VARIABLES ========== */

  Configuration public override config;

  Incident[] public override incidents;

  /* ========== CONSTRUCTOR ========== */

  constructor(address nxmAddress, address coverNFTAddress) {
    nxm = INXMToken(nxmAddress);
    coverNFT = ICoverNFT(coverNFTAddress);
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

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(IMasterAwareV2.ID.CO)]);
  }

  function getIncidentsCount() external override view returns (uint) {
    return incidents.length;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external onlyAdvisoryBoard override {
    ICover coverContract = cover();
    uint96 activeCoverAmountInNXM = coverContract.activeCoverAmountInNXM(productId);

    Incident memory incident = Incident(
      0, // assessmentId
      productId,
      date,
      priceBefore
    );
    (
      uint16 productType,
      /*address productAddress*/,
      /*uint payoutAssets*/
    ) = coverContract.products(productId);
    (
      /*string descriptionIpfsHash*/,
      uint8 redeemMethod,
      /*uint gracePeriod*/
    ) = coverContract.productTypes(productType);
    require(redeemMethod == uint8(ICover.RedeemMethod.Incident), "Invalid redeem method");

    uint expectedPayoutInNXM = activeCoverAmountInNXM * config.incidentExpectedPayoutRatio /
      INCIDENT_EXPECTED_PAYOUT_DENOMINATOR;

    // Determine the total rewards that should be minted for the assessors based on cover period
    uint totalReward = expectedPayoutInNXM * config.rewardRatio / REWARD_DENOMINATOR;
    uint assessmentId = assessment().startAssessment(totalReward, 0);
    incident.assessmentId = uint80(assessmentId);
    incidents.push(incident);
  }

  function redeemIncidentPayout(uint104 incidentId, uint32 coverId, uint depeggedTokens)
  external onlyMember override returns (uint, uint8) {
    Incident memory incident =  incidents[incidentId];
    {
      IAssessment.Poll memory poll = assessment().getPoll(incident.assessmentId);

      require(
        poll.accepted > poll.denied,
        "The incident must be accepted"
      );

      (,,uint8 payoutCooldownDays) = assessment().config();
      require(
        block.timestamp >= poll.end + payoutCooldownDays * 1 days,
        "The voting and cooldown periods must end"
      );

      require(
        block.timestamp < poll.end +
        payoutCooldownDays * 1 days +
        config.payoutRedemptionPeriodDays * 1 days,
        "The redemption period has expired"
      );
    }

    uint payoutAmount;
    uint8 payoutAsset;
    address payable coverOwner;
    address coveredToken;
    {
      ICover coverContract = ICover(getInternalContractAddress(ID.CO));

      uint24 productId;
      uint32 start;
      uint32 period;
      uint96 coverAmount;
      (
        productId,
        payoutAsset,
        coverAmount,
        start,
        period,
      ) = coverContract.covers(coverId);

      {
        uint deductiblePriceBefore = incident.priceBefore * config.incidentPayoutDeductibleRatio /
          INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR;
        payoutAmount = depeggedTokens * deductiblePriceBefore / PRECISION;
      }
      {
        require(payoutAmount <= coverAmount, "Payout exceeds covered amount");
        coverOwner = payable(coverContract.performPayoutBurn(coverId, payoutAmount));
        require(start + period >= incident.date, "Cover end date is before the incident");
        require(start < incident.date, "Cover start date is after the incident");
        uint16 productType;

        (
          productType,
          coveredToken,
          /*uint payoutAssets*/
        ) = coverContract.products(productId);
        (
          /*string descriptionIpfsHash*/,
          /*uint8 redeemMethod*/,
          uint gracePeriod
        ) = coverContract.productTypes(productType);
        require(start + period + gracePeriod * 1 days >= block.timestamp, "Grace period has expired");
        require(productId == incident.productId, "Product id mismatch");
      }
    }

    IPool poolContract = IPool(internalContracts[uint(IMasterAwareV2.ID.P1)]);
    IERC20(coveredToken).transferFrom(msg.sender, address(this), depeggedTokens);
    poolContract.sendPayout(payoutAsset, coverOwner, payoutAmount);

    return (payoutAmount, payoutAsset);

  }

  function withdrawAsset(address asset, address destination, uint amount) external onlyGovernance {
    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferAmount = amount > balance ? balance : amount;
    token.transfer(destination, transferAmount);
  }

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values)
  external override onlyGovernance {
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == UintParams.payoutRedemptionPeriodDays) {
        newConfig.payoutRedemptionPeriodDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.incidentExpectedPayoutRatio) {
        newConfig.incidentExpectedPayoutRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.incidentExpectedPayoutRatio) {
        newConfig.incidentExpectedPayoutRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.rewardRatio) {
        newConfig.rewardRatio = uint16(values[i]);
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

}
