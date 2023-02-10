// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/IStakingProducts.sol";

contract CoverMockStakingProducts is IStakingProducts {

  function setProducts(uint /*poolId*/, StakedProductParam[] memory /*params*/) external pure {
    revert('CoverMockStakingProducts: Not callable');
  }

  function setInitialProducts(uint /*poolId*/, ProductInitializationParams[] memory /*params*/) external pure {
    // revert('CoverMockStakingProducts: Not callable');
  }

  function getProductTargetWeight(uint /*poolId*/, uint /*productId*/) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function getTotalTargetWeight(uint /*poolId*/) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function getTotalEffectiveWeight(uint /*poolId*/) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function getProduct(uint /*poolId*/, uint /*productId*/) external pure returns (
    uint /*lastEffectiveWeight*/,
    uint /*targetWeight*/,
    uint /*targetPrice*/,
    uint /*bumpedPrice*/,
    uint /*bumpedPriceUpdateTime*/
  ) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function getPremium(
    uint /*poolId*/,
    uint /*productId*/,
    uint /*period*/,
    uint /*coverAmount*/,
    uint /*initialCapacityUsed*/,
    uint /*totalCapacity*/,
    uint /*globalMinPrice*/,
    bool /*useFixedPrice*/,
    uint /*nxmPerAllocationUnit*/,
    uint /*allocationUnitsPerNxm*/
  ) external pure returns (uint /*premium*/) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function calculateFixedPricePremium(
    uint /*coverAmount*/,
    uint /*period*/,
    uint /*fixedPrice*/,
    uint /*nxmPerAllocationUnit*/,
    uint /*targetPriceDenominator*/
  ) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function calculatePremium(
    StakedProduct memory /*product*/,
    uint /*period*/,
    uint /*coverAmount*/,
    uint /*initialCapacityUsed*/,
    uint /*totalCapacity*/,
    uint /*targetPrice*/,
    uint /*currentBlockTimestamp*/,
    uint /*nxmPerAllocationUnit*/,
    uint /*allocationUnitsPerNxm*/,
    uint /*targetPriceDenominator*/
  ) external pure returns (uint /*premium*/, StakedProduct memory) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function calculatePremiumPerYear(
    uint /*basePrice*/,
    uint /*coverAmount*/,
    uint /*initialCapacityUsed*/,
    uint /*totalCapacity*/,
    uint /*nxmPerAllocationUnit*/,
    uint /*allocationUnitsPerNxm*/,
    uint /*targetPriceDenominator*/
  ) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function calculateSurgePremium(
    uint /*amountOnSurge*/,
    uint /*totalCapacity*/,
    uint /*allocationUnitsPerNxm*/
  ) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

}
