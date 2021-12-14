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

/// Allows cover owners to redeem payouts from yield token depeg incidents. It is an entry point
/// to the assessment process where the members of the mutual decides the validity of the
/// submitted incident. At the moment incidents can only be submitted by the Advisory Board members
/// while all members are allowed to vote through Assessment.sol.
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
    // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 50% = 1.30%
    config.rewardRatio = 130; // 1.3%
    config.expectedPayoutRatio = 3000; // 30%
    config.payoutDeductibleRatio = 9000; // 90%
    config.payoutRedemptionPeriodInDays = 14; // days
    config.maxRewardInNXMWad = 50; // 50 NXM
    master = INXMMaster(masterAddress);
  }

  /* ========== VIEWS ========== */

  function min(uint a, uint b) internal pure returns (uint) {
    return a < b ? a : b;
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(IMasterAwareV2.ID.MR)]);
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(ID.AS));
  }

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(IMasterAwareV2.ID.CO)]);
  }

  /// @dev Returns the number of incidents.
  function getIncidentsCount() external override view returns (uint) {
    return incidents.length;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// Submits an incident for assessment
  ///
  /// @param productId            Product identifier on which the incident occured
  /// @param priceBefore          The price of the token before the incident
  /// @param priceBefore          The price of the token before the incident
  /// @param date                 The date the incident occured
  /// @param expectedPayoutInNXM  The date the incident occured
  /// @param ipfsMetadata         An IPFS hash that stores metadata about the incident that is
  ///                             emitted as an event.
  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date,
    uint expectedPayoutInNXM,
    string calldata ipfsMetadata
  ) external onlyAdvisoryBoard override {
    ICover coverContract = cover();

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

    // Determine the total rewards that should be minted for the assessors based on cover period
    uint totalReward = min(
      uint(config.maxRewardInNXMWad) * PRECISION,
      expectedPayoutInNXM * uint(config.rewardRatio) / REWARD_DENOMINATOR
    );
    uint assessmentId = assessment().startAssessment(totalReward, 0);
    incident.assessmentId = uint80(assessmentId);
    incidents.push(incident);

    emit MetadataSubmitted(incidents.length - 1, expectedPayoutInNXM, ipfsMetadata);
  }

  /// Redeems payouts for eligible covers matching an accepted incident
  ///
  /// @dev The function must be called during the redemption period.
  ///
  /// @param incidentId      Index of the incident
  /// @param coverId         Index of the cover to be redeemed
  /// @param depeggedTokens  The amount of depegged tokens to be swapped for the payoutAsset.
  /// @param payoutAddress   The addres where the payout must be sent to
  function redeemIncidentPayout(
    uint104 incidentId,
    uint32 coverId,
    uint depeggedTokens,
    address payable payoutAddress
  ) external onlyMember override returns (uint, uint8) {
    Incident memory incident =  incidents[incidentId];
    {
      IAssessment.Poll memory poll = assessment().getPoll(incident.assessmentId);

      require(
        poll.accepted > poll.denied,
        "The incident must be accepted"
      );

      (,,uint8 payoutCooldownInDays,) = assessment().config();
      require(
        block.timestamp >= poll.end + payoutCooldownInDays * 1 days,
        "The voting and cooldown periods must end"
      );

      require(
        block.timestamp < poll.end +
        payoutCooldownInDays * 1 days +
        config.payoutRedemptionPeriodInDays * 1 days,
        "The redemption period has expired"
      );
    }

    uint payoutAmount;
    uint8 payoutAsset;
    address coveredToken;

    {
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
      ) = ICover(getInternalContractAddress(ID.CO)).covers(coverId);

      {
        uint deductiblePriceBefore = uint(incident.priceBefore) * uint(config.payoutDeductibleRatio) /
          INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR;
        uint payoutAssetDecimals;
        {
          IPool poolContract = IPool(internalContracts[uint(IMasterAwareV2.ID.P1)]);
          (,payoutAssetDecimals,) = poolContract.assets(payoutAsset);
        }
        payoutAmount = depeggedTokens * deductiblePriceBefore / (10 ** uint(payoutAssetDecimals));
      }

      {

        require(coverNFT.isApprovedOrOwner(msg.sender, coverId), "Only the cover owner or approved addresses can redeem");
        require(payoutAmount <= coverAmount, "Payout exceeds covered amount");
        require(start + period >= incident.date, "Cover end date is before the incident");
        require(start <= incident.date, "Cover start date is after the incident");

        ICover coverContract = ICover(getInternalContractAddress(ID.CO));
        coverContract.performPayoutBurn(coverId, payoutAmount);
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

    IERC20(coveredToken).transferFrom(msg.sender, address(this), depeggedTokens);
    IPool poolContract = IPool(internalContracts[uint(IMasterAwareV2.ID.P1)]);
    poolContract.sendPayout(payoutAsset, payoutAddress, payoutAmount);

    return (payoutAmount, payoutAsset);
  }

  /// Withdraws an amount of any asset held by this contract to a destination address.
  ///
  /// @param asset        The ERC20 address of the asset that needs to be withdrawn.
  /// @param destination  The address where the assets are transfered.
  /// @param amount       The amount of assets that are need to be transfered.
  function withdrawAsset(address asset, address destination, uint amount) external onlyGovernance {
    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferAmount = amount > balance ? balance : amount;
    token.transfer(destination, transferAmount);
  }

  /// Redeems payouts for accepted claims
  ///
  /// @param paramNames  An array of elements from UintParams enum
  /// @param values      An array of the new values, each one corresponding to the parameter
  ///                    from paramNames on the same position.
  function updateUintParameters(
    UintParams[] calldata paramNames,
    uint[] calldata values
  ) external override onlyGovernance {
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == UintParams.payoutRedemptionPeriodInDays) {
        newConfig.payoutRedemptionPeriodInDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.expectedPayoutRatio) {
        newConfig.expectedPayoutRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.payoutDeductibleRatio) {
        newConfig.payoutDeductibleRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.maxRewardInNXMWad) {
        newConfig.maxRewardInNXMWad = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.rewardRatio) {
        newConfig.rewardRatio = uint16(values[i]);
        continue;
      }
    }
    config = newConfig;
  }

  /// @dev Updates internal contract addresses to the ones stored in master. This function is
  /// automatically called by the master contract when a contract is added or upgraded.
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
  }

}
