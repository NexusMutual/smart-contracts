// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IYieldTokenIncidents.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

/// Allows cover owners to redeem payouts from yield token depeg incidents. It is an entry point
/// to the assessment process where the members of the mutual decides the validity of the
/// submitted incident. At the moment incidents can only be submitted by the Advisory Board members
/// while all members are allowed to vote through Assessment.sol.
contract YieldTokenIncidents is IYieldTokenIncidents, MasterAwareV2 {

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

  function initialize() external {
    Configuration memory currentConfig = config;
    bool notInitialized = bytes32(
      abi.encodePacked(
        currentConfig.rewardRatio,
        currentConfig.expectedPayoutRatio,
        currentConfig.payoutDeductibleRatio,
        currentConfig.payoutRedemptionPeriodInDays,
        currentConfig.maxRewardInNXMWad
      )
    ) == bytes32(0);
    require(notInitialized, "Already initialized");

    // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 50% = 1.30%
    config.rewardRatio = 130; // 1.3%
    config.expectedPayoutRatio = 3000; // 30%
    config.payoutDeductibleRatio = 9000; // 90%
    config.payoutRedemptionPeriodInDays = 14; // days
    config.maxRewardInNXMWad = 50; // 50 NXM
  }

  /* ========== VIEWS ========== */

  function assessment() internal view returns (IAssessment) {
    return IAssessment(getInternalContractAddress(AS));
  }

  function cover() internal view returns (ICover) {
    return ICover(getInternalContractAddress(CO));
  }

  /// @dev Returns the number of incidents.
  function getIncidentsCount() external override view returns (uint) {
    return incidents.length;
  }

  function getIncidentDisplay(uint id) internal view returns (IncidentDisplay memory) {
    Incident memory incident = incidents[id];
    (IAssessment.Poll memory poll,,) = assessment().assessments(incident.assessmentId);

    IncidentStatus incidentStatus;

    (,,uint payoutCooldownInDays,) = assessment().config();
    uint redeemableUntil = poll.end + (payoutCooldownInDays + config.payoutRedemptionPeriodInDays) * 1 days;

    // Determine the incidents status
    if (block.timestamp < poll.end) {
      incidentStatus = IncidentStatus.PENDING;
    } else if (poll.accepted > poll.denied) {
      if (block.timestamp > redeemableUntil) {
        incidentStatus = IncidentStatus.EXPIRED;
      } else {
        incidentStatus = IncidentStatus.ACCEPTED;
      }
    } else {
      incidentStatus = IncidentStatus.DENIED;
    }


    return IncidentDisplay(
      id,
      incident.productId,
      incident.priceBefore,
      incident.date,
      poll.start,
      poll.end,
      redeemableUntil,
      uint(incidentStatus)
    );
  }

  /// Returns an array of incidents aggregated in a human-friendly format.
  ///
  /// @dev This view is meant to be used in user interfaces to get incidents in a format suitable
  /// for displaying all relevant information in as few calls as possible. It can be used to
  /// paginate incidents by providing the following parameters:
  ///
  /// @param ids   Array of Incident ids which are returned as IncidentDisplay
  function getIncidentsToDisplay (uint104[] calldata ids)
  external view returns (IncidentDisplay[] memory) {
    IncidentDisplay[] memory incidentDisplays = new IncidentDisplay[](ids.length);
    for (uint i = 0; i < ids.length; i++) {
      uint104 id = ids[i];
      incidentDisplays[i] = getIncidentDisplay(id);
    }
    return incidentDisplays;
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
  ) external override onlyAdvisoryBoard whenNotPaused {
    ICover coverContract = cover();
    Product memory product = coverContract.products(productId);
    ProductType memory productType = coverContract.productTypes(product.productType);
    require(
      productType.claimMethod == uint8(ClaimMethod.YieldTokenIncidents),
      "Invalid claim method for this product type"
    );

    // Determine the total rewards that should be minted for the assessors based on cover period
    uint totalReward = Math.min(
      uint(config.maxRewardInNXMWad) * PRECISION,
      expectedPayoutInNXM * uint(config.rewardRatio) / REWARD_DENOMINATOR
    );
    uint incidentId = incidents.length;
    uint80 assessmentId = SafeUintCast.toUint80(assessment().startAssessment(totalReward, 0));

    incidents.push(Incident(assessmentId, productId, date, priceBefore));

    if (bytes(ipfsMetadata).length > 0) {
      emit MetadataSubmitted(incidentId, ipfsMetadata);
    }

    emit IncidentSubmitted(msg.sender, incidentId, productId, expectedPayoutInNXM);
  }

  /// Redeems payouts for eligible covers matching an accepted incident
  ///
  /// @dev The function must be called during the redemption period.
  ///
  /// @param incidentId      Index of the incident
  /// @param coverId         Index of the cover to be redeemed
  /// @param segmentId       Index of the cover's segment that's elidgible for redemption
  /// @param depeggedTokens  The amount of depegged tokens to be swapped for the coverAsset
  /// @param payoutAddress   The addres where the payout must be sent to
  /// @param optionalParams  (Optional) Reserved for permit data which is still in draft phase.
  ///                        For tokens that already support it, use it by encoding the following
  ///                        values in this exact order: address owner, address spender,
  ///                        uint256 value, uint256 deadline, uint8 v , bytes32 r, bytes32 s
  function redeemPayout(
    uint104 incidentId,
    uint32 coverId,
    uint segmentId,
    uint depeggedTokens,
    address payable payoutAddress,
    bytes calldata optionalParams
  ) external override onlyMember whenNotPaused returns (uint, uint8) {
    require(
      coverNFT.isApprovedOrOwner(msg.sender, coverId),
      "Only the cover owner or approved addresses can redeem"
    );

    ICover coverContract = ICover(getInternalContractAddress(CO));
    CoverData memory coverData = coverContract.coverData(coverId);
    Product memory product = coverContract.products(coverData.productId);

    uint payoutAmount;
    {
      CoverSegment memory coverSegment = coverContract.coverSegments(
        coverId,
        segmentId
      );

      {
        require(
          coverSegment.start + coverSegment.period +
          coverSegment.gracePeriodInDays * 1 days >= block.timestamp,
          "Grace period has expired"
        );
      }

      Incident memory incident =  incidents[incidentId];

      {
        IAssessment.Poll memory poll = assessment().getPoll(incident.assessmentId);

        require(
          poll.accepted > poll.denied,
          "The incident needs to be accepted"
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

      require(
        coverSegment.start + coverSegment.period >= incident.date,
        "Cover ended before the incident"
      );

      require(coverSegment.start < incident.date, "Cover started after the incident");

      require(coverData.productId == incident.productId, "Product id mismatch");

      // Calculate the payout amount
      {
        uint deductiblePriceBefore = uint(incident.priceBefore) *
          uint(config.payoutDeductibleRatio) / INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR;
        (,uint coverAssetDecimals) = IPool(
          getInternalContractAddress(P1)
        ).coverAssets(coverData.coverAsset);
        payoutAmount = depeggedTokens * deductiblePriceBefore / (10 ** uint(coverAssetDecimals));
      }

      require(payoutAmount <= coverSegment.amount, "Payout exceeds covered amount");
    }

    coverContract.performStakeBurn(coverId, segmentId, payoutAmount);

    if (optionalParams.length > 0) { // Skip the permit call when it is not provided
      (
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
      ) = abi.decode(optionalParams, (address, address, uint256, uint256, uint8, bytes32, bytes32));

      if (spender != address(0)) {
        IERC20Permit(product.yieldTokenAddress).permit(owner, spender, value, deadline, v, r, s);
      }
    }

    SafeERC20.safeTransferFrom(
      IERC20(product.yieldTokenAddress),
      msg.sender,
      address(this),
      depeggedTokens
    );

    IPool(getInternalContractAddress(P1)).sendPayout(
      coverData.coverAsset,
      payoutAddress,
      payoutAmount
    );

    emit IncidentPayoutRedeemed(msg.sender, payoutAmount, incidentId, coverId);

    return (payoutAmount, coverData.coverAsset);
  }

  /// Withdraws an amount of any asset held by this contract to a destination address.
  ///
  /// @param asset        The ERC20 address of the asset that needs to be withdrawn.
  /// @param destination  The address where the assets are transfered.
  /// @param amount       The amount of assets that are need to be transfered.
  function withdrawAsset(
    address asset,
    address destination,
    uint amount
  ) external onlyGovernance {
    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferAmount = amount > balance ? balance : amount;
    SafeERC20.safeTransfer(token, destination, transferAmount);
  }

  /// Updates configurable parameters through governance
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

  function usedInternalContracts() internal pure override returns (uint) {
    return TC | MR | P1 | CO | AS;
  }
}
