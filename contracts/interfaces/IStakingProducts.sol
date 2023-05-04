// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./ICover.sol";
import "./IStakingPool.sol";

interface IStakingProducts {

  // TODO: resize values?
  struct Weights {
    uint32 totalEffectiveWeight;
    uint32 totalTargetWeight;
  }

  struct StakedProduct {
    uint16 lastEffectiveWeight;
    uint8 targetWeight;
    uint96 targetPrice;
    uint96 bumpedPrice;
    uint32 bumpedPriceUpdateTime;
  }

  /* ============= PRODUCT FUNCTIONS ============= */

  function setProducts(uint poolId, StakedProductParam[] memory params) external;

  function setInitialProducts(uint poolId, ProductInitializationParams[] memory params) external;

  function getProductTargetWeight(uint poolId, uint productId) external view returns (uint);

  function getTotalTargetWeight(uint poolId) external view returns (uint);

  function getTotalEffectiveWeight(uint poolId) external view returns (uint);

  function getProduct(uint poolId, uint productId) external view returns (
    uint lastEffectiveWeight,
    uint targetWeight,
    uint targetPrice,
    uint bumpedPrice,
    uint bumpedPriceUpdateTime
  );

  /* ============= PRICING FUNCTIONS ============= */

  function getPremium(
    uint poolId,
    uint productId,
    uint period,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint globalMinPrice,
    bool useFixedPrice,
    uint nxmPerAllocationUnit,
    uint allocationUnitsPerNxm
  ) external returns (uint premium);

  function calculateFixedPricePremium(
    uint coverAmount,
    uint period,
    uint fixedPrice,
    uint nxmPerAllocationUnit,
    uint targetPriceDenominator
  ) external pure returns (uint);


  function calculatePremium(
    StakedProduct memory product,
    uint period,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint targetPrice,
    uint currentBlockTimestamp,
    uint nxmPerAllocationUnit,
    uint allocationUnitsPerNxm,
    uint targetPriceDenominator
  ) external pure returns (uint premium, StakedProduct memory);

  function calculatePremiumPerYear(
    uint basePrice,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint nxmPerAllocationUnit,
    uint allocationUnitsPerNxm,
    uint targetPriceDenominator
  ) external pure returns (uint);

  // Calculates the premium for a given cover amount starting with the surge point
  function calculateSurgePremium(
    uint amountOnSurge,
    uint totalCapacity,
    uint allocationUnitsPerNxm
  ) external pure returns (uint);

  /* ============= EVENTS ============= */

  event ProductUpdated(uint productId, uint8 targetWeight, uint96 targetPrice);

  /* ============= ERRORS ============= */

  // Auth
  error OnlyStakingPool();
  error OnlyCoverContract();
  error OnlyManager();

  // Products & weights
  error MustSetPriceForNewProducts();
  error MustSetWeightForNewProducts();
  error TargetPriceTooHigh();
  error TargetPriceBelowMin();
  error TargetWeightTooHigh();
  error MustRecalculateEffectiveWeight();
  error TotalTargetWeightExceeded();
  error TotalEffectiveWeightExceeded();

}
