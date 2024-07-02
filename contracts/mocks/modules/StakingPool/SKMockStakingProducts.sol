// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../abstract/MasterAwareV2.sol";
import "../../../abstract/Multicall.sol";
import "../../../interfaces/IStakingProducts.sol";
import "../../../interfaces/ICover.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../../libraries/Math.sol";
import "../../../libraries/SafeUintCast.sol";
import "../../../libraries/StakingPoolLibrary.sol";
import "../../generic/StakingProductsGeneric.sol";

contract SKMockStakingProducts is StakingProductsGeneric, MasterAwareV2, Multicall {
  using SafeUintCast for uint;

  uint public constant SURGE_PRICE_RATIO = 2 ether;
  uint public constant SURGE_THRESHOLD_RATIO = 90_00; // 90.00%
  uint public constant SURGE_THRESHOLD_DENOMINATOR = 100_00; // 100.00%
  // base price bump
  // +0.2% for each 1% of capacity used, ie +20% for 100%
  uint public constant PRICE_BUMP_RATIO = 20_00; // 20%
  // bumped price smoothing
  // 0.5% per day
  uint public constant PRICE_CHANGE_PER_DAY = 50; // 0.5%
  uint public constant INITIAL_PRICE_DENOMINATOR = 100_00;
  uint public constant TARGET_PRICE_DENOMINATOR = 100_00;
  uint public constant MAX_TOTAL_WEIGHT = 20_00; // 20x

  // The 3 constants below are also used in the StakingPool contract
  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8; // 7 whole quarters + 1 partial quarter
  uint public constant WEIGHT_DENOMINATOR = 100;

  // pool id => product id => Product
  mapping(uint => mapping(uint => StakedProduct)) private _products;
  // pool id => { totalEffectiveWeight, totalTargetWeight }
  mapping(uint => Weights) public weights;

  address public immutable coverContract;
  address public immutable coverProductsContract;
  address public immutable stakingPoolFactory;

  constructor(address _coverContract, address _stakingPoolFactory, address _coverProductsContract) {
    coverContract = _coverContract;
    stakingPoolFactory = _stakingPoolFactory;
    coverProductsContract = _coverProductsContract;
  }

  function stakingPool(uint poolId) public override view returns (IStakingPool stakingPoolAddress) {
    stakingPoolAddress = IStakingPool(StakingPoolLibrary.getAddress(stakingPoolFactory, poolId));
  }

  function getProductTargetWeight(uint poolId, uint productId) external view override returns (uint) {
    return uint(_products[poolId][productId].targetWeight);
  }

  function getTotalTargetWeight(uint poolId) external override view returns (uint) {
    return weights[poolId].totalTargetWeight;
  }

  function getTotalEffectiveWeight(uint poolId) external override view returns (uint) {
    return weights[poolId].totalEffectiveWeight;
  }

  function getProduct(uint poolId, uint productId) external override view returns (
    uint lastEffectiveWeight,
    uint targetWeight,
    uint targetPrice,
    uint bumpedPrice,
    uint bumpedPriceUpdateTime
  ) {
    StakedProduct memory product = _products[poolId][productId];
    return (
    product.lastEffectiveWeight,
    product.targetWeight,
    product.targetPrice,
    product.bumpedPrice,
    product.bumpedPriceUpdateTime
    );
  }

  function recalculateEffectiveWeights(uint poolId, uint[] calldata productIds) external {

    uint globalCapacityRatio = ICover(coverContract).getGlobalCapacityRatio();
    uint[] memory capacityReductionRatios = ICoverProducts(coverProductsContract).getCapacityReductionRatios(productIds);

    IStakingPool _stakingPool = stakingPool(poolId);

    uint _totalEffectiveWeight = weights[poolId].totalEffectiveWeight;

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      StakedProduct memory _product = _products[poolId][productId];

      uint16 previousEffectiveWeight = _product.lastEffectiveWeight;
      _product.lastEffectiveWeight = _getEffectiveWeight(
        _stakingPool,
        productId,
        _product.targetWeight,
        globalCapacityRatio,
        capacityReductionRatios[i]
      );
      _totalEffectiveWeight = _totalEffectiveWeight - previousEffectiveWeight + _product.lastEffectiveWeight;
      _products[poolId][productId] = _product;
    }

    weights[poolId].totalEffectiveWeight = _totalEffectiveWeight.toUint32();
  }

  function setProducts(uint poolId, StakedProductParam[] memory params) external override {

    IStakingPool _stakingPool = stakingPool(poolId);

    if (msg.sender != _stakingPool.manager()) {
      revert OnlyManager();
    }

    uint globalCapacityRatio;
    uint globalMinPriceRatio;

    uint[] memory initialPriceRatios;
    uint[] memory capacityReductionRatios;

    {
      uint numProducts = params.length;
      uint[] memory productIds = new uint[](numProducts);

      for (uint i = 0; i < numProducts; i++) {
        productIds[i] = params[i].productId;
        if (!ICoverProducts(coverProductsContract).isPoolAllowed(params[i].productId, poolId)) {
          revert ICoverProducts.PoolNotAllowedForThisProduct(params[i].productId);
        }
      }

      ICoverProducts _coverProducts = ICoverProducts(coverProductsContract);
      ICover _cover = ICover(coverContract);

      globalCapacityRatio = _cover.getGlobalCapacityRatio();
      globalMinPriceRatio = _cover.getGlobalMinPriceRatio();

      initialPriceRatios = _coverProducts.getInitialPrices(productIds);
      capacityReductionRatios = _coverProducts.getCapacityReductionRatios(productIds);
    }

    Weights memory _weights = weights[poolId];
    bool targetWeightIncreased;

    for (uint i = 0; i < params.length; i++) {
      StakedProductParam memory _param = params[i];
      StakedProduct memory _product = _products[poolId][_param.productId];

      // if this is a new product
      if (_product.bumpedPriceUpdateTime == 0) {
        // initialize the bumpedPrice
        _product.bumpedPrice = initialPriceRatios[i].toUint96();
        _product.bumpedPriceUpdateTime = uint32(block.timestamp);
        // and make sure we set the price and the target weight
        if (!_param.setTargetPrice) {
          revert MustSetPriceForNewProducts();
        }
        if (!_param.setTargetWeight) {
          revert MustSetWeightForNewProducts();
        }
      }

      if (_param.setTargetPrice) {
        if (_param.targetPrice > TARGET_PRICE_DENOMINATOR) {
          revert TargetPriceTooHigh();
        }
        if (_param.targetPrice < globalMinPriceRatio) {
          revert TargetPriceBelowMin();
        }
        _product.targetPrice = _param.targetPrice;
      }

      // if setTargetWeight is set - effective weight must be recalculated
      if (_param.setTargetWeight && !_param.recalculateEffectiveWeight) {
        revert MustRecalculateEffectiveWeight();
      }

      // Must recalculate effectiveWeight to adjust targetWeight
      if (_param.recalculateEffectiveWeight) {

        if (_param.setTargetWeight) {
          if (_param.targetWeight > WEIGHT_DENOMINATOR) {
            revert TargetWeightTooHigh();
          }

          // totalEffectiveWeight cannot be above the max unless target  weight is not increased
          if (!targetWeightIncreased) {
            targetWeightIncreased = _param.targetWeight > _product.targetWeight;
          }
          _weights.totalTargetWeight = _weights.totalTargetWeight - _product.targetWeight + _param.targetWeight;
          _product.targetWeight = _param.targetWeight;
        }

        // subtract the previous effective weight
        _weights.totalEffectiveWeight -= _product.lastEffectiveWeight;

        _product.lastEffectiveWeight = _getEffectiveWeight(
          _stakingPool,
          _param.productId,
          _product.targetWeight,
          globalCapacityRatio,
          capacityReductionRatios[i]
        );

        // add the new effective weight
        _weights.totalEffectiveWeight += _product.lastEffectiveWeight;
      }

      // sstore
      _products[poolId][_param.productId] = _product;

      emit ProductUpdated(_param.productId, _param.targetWeight, _param.targetPrice);
    }

    if (_weights.totalTargetWeight > MAX_TOTAL_WEIGHT) {
      revert TotalTargetWeightExceeded();
    }

    if (targetWeightIncreased) {
      if (_weights.totalEffectiveWeight > MAX_TOTAL_WEIGHT) {
        revert TotalEffectiveWeightExceeded();
      }
    }

    weights[poolId] = _weights;
  }

  function getEffectiveWeight(
    uint poolId,
    uint productId,
    uint targetWeight,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) public view returns (uint effectiveWeight) {

    IStakingPool _stakingPool = stakingPool(poolId);

    return _getEffectiveWeight(
      _stakingPool,
      productId,
      targetWeight,
      globalCapacityRatio,
      capacityReductionRatio
    );
  }

  function _getEffectiveWeight(
    IStakingPool _stakingPool,
    uint productId,
    uint targetWeight,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) internal view returns (uint16 effectiveWeight) {

    uint[] memory trancheCapacities = _stakingPool.getTrancheCapacities(
      productId,
      block.timestamp / TRANCHE_DURATION, // first active tranche id
      MAX_ACTIVE_TRANCHES,
      globalCapacityRatio,
      capacityReductionRatio
    );

    uint totalCapacity = Math.sum(trancheCapacities);

    if (totalCapacity == 0) {
      return targetWeight.toUint16();
    }

    uint[] memory activeAllocations = _stakingPool.getActiveAllocations(productId);
    uint totalAllocation = Math.sum(activeAllocations);
    uint actualWeight = Math.min(totalAllocation * WEIGHT_DENOMINATOR / totalCapacity, type(uint16).max);

    return Math.max(targetWeight, actualWeight).toUint16();
  }

  function setInitialProducts(uint poolId, ProductInitializationParams[] memory params) public onlyInternal {

    uint totalTargetWeight;

    for (uint i = 0; i < params.length; i++) {

      ProductInitializationParams memory param = params[i];

      if (param.targetPrice > TARGET_PRICE_DENOMINATOR) {
        revert TargetPriceTooHigh();
      }

      if (param.weight > WEIGHT_DENOMINATOR) {
        revert TargetWeightTooHigh();
      }

      StakedProduct memory product;
      product.bumpedPrice = param.initialPrice;
      product.bumpedPriceUpdateTime = block.timestamp.toUint32();
      product.targetPrice = param.targetPrice;
      product.targetWeight = param.weight;

      // sstore
      _products[poolId][param.productId] = product;

      totalTargetWeight += param.weight;
    }

    if (totalTargetWeight > MAX_TOTAL_WEIGHT) {
      revert TotalTargetWeightExceeded();
    }

    weights[poolId] = Weights({
    totalTargetWeight: totalTargetWeight.toUint32(),
    totalEffectiveWeight: totalTargetWeight.toUint32()
    });
  }

  /* pricing code */
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
    uint allocationUnitsPerNXM
  ) public override returns (uint premium) {

    StakedProduct memory product = _products[poolId][productId];
    uint targetPrice = Math.max(product.targetPrice, globalMinPrice);

    if (useFixedPrice) {
      return calculateFixedPricePremium(period, coverAmount, targetPrice, nxmPerAllocationUnit, TARGET_PRICE_DENOMINATOR);
    }

    (premium, product) = calculatePremium(
      product,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      targetPrice,
      block.timestamp,
      nxmPerAllocationUnit,
      allocationUnitsPerNXM,
      TARGET_PRICE_DENOMINATOR
    );

    // sstore
    _products[poolId][productId] = product;

    return premium;
  }

  function calculateFixedPricePremium(
    uint coverAmount,
    uint period,
    uint fixedPrice,
    uint nxmPerAllocationUnit,
    uint targetPriceDenominator
  ) public override pure returns (uint) {

    uint premiumPerYear =
    coverAmount
    * nxmPerAllocationUnit
    * fixedPrice
    / targetPriceDenominator;

    return premiumPerYear * period / 365 days;
  }

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
  ) public override pure returns (uint premium, StakedProduct memory) {

    uint basePrice;
    {
      // use previously recorded bumped price and apply time based smoothing towards target price
      uint timeSinceLastUpdate = currentBlockTimestamp - product.bumpedPriceUpdateTime;
      uint priceDrop = PRICE_CHANGE_PER_DAY * timeSinceLastUpdate / 1 days;

      // basePrice = max(targetPrice, bumpedPrice - priceDrop)
      // rewritten to avoid underflow
      basePrice = product.bumpedPrice < targetPrice + priceDrop
      ? targetPrice
      : product.bumpedPrice - priceDrop;
    }

    // calculate the bumped price by applying the price bump
    uint priceBump = PRICE_BUMP_RATIO * coverAmount / totalCapacity;
    product.bumpedPrice = (basePrice + priceBump).toUint96();
    product.bumpedPriceUpdateTime = uint32(currentBlockTimestamp);

    // use calculated base price and apply surge pricing if applicable
    uint premiumPerYear = calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      nxmPerAllocationUnit,
      allocationUnitsPerNxm,
      targetPriceDenominator
    );

    // calculate the premium for the requested period
    return (premiumPerYear * period / 365 days, product);
  }

  function calculatePremiumPerYear(
    uint basePrice,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint nxmPerAllocationUnit,
    uint allocationUnitsPerNxm,
    uint targetPriceDenominator
  ) public override pure returns (uint) {
    // cover amount has 2 decimals (100 = 1 unit)
    // scale coverAmount to 18 decimals and apply price percentage
    uint basePremium = coverAmount * nxmPerAllocationUnit * basePrice / targetPriceDenominator;
    uint finalCapacityUsed = initialCapacityUsed + coverAmount;

    // surge price is applied for the capacity used above SURGE_THRESHOLD_RATIO.
    // the surge price starts at zero and increases linearly.
    // to simplify things, we're working with fractions/ratios instead of percentages,
    // ie 0 to 1 instead of 0% to 100%, 100% = 1 (a unit).
    //
    // surgeThreshold = SURGE_THRESHOLD_RATIO / SURGE_THRESHOLD_DENOMINATOR
    //                = 90_00 / 100_00 = 0.9
    uint surgeStartPoint = totalCapacity * SURGE_THRESHOLD_RATIO / SURGE_THRESHOLD_DENOMINATOR;

    // Capacity and surge pricing
    //
    //        i        f                         s
    //   ▓▓▓▓▓░░░░░░░░░                          ▒▒▒▒▒▒▒▒▒▒
    //
    //  i - initial capacity used
    //  f - final capacity used
    //  s - surge start point

    // if surge does not apply just return base premium
    // i < f <= s case
    if (finalCapacityUsed <= surgeStartPoint) {
      return basePremium;
    }

    // calculate the premium amount incurred due to surge pricing
    uint amountOnSurge = finalCapacityUsed - surgeStartPoint;
    uint surgePremium = calculateSurgePremium(amountOnSurge, totalCapacity, allocationUnitsPerNxm);

    // if the capacity start point is before the surge start point
    // the surge premium starts at zero, so we just return it
    // i <= s < f case
    if (initialCapacityUsed <= surgeStartPoint) {
      return basePremium + surgePremium;
    }

    // otherwise we need to subtract the part that was already used by other covers
    // s < i < f case
    uint amountOnSurgeSkipped = initialCapacityUsed - surgeStartPoint;
    uint surgePremiumSkipped = calculateSurgePremium(amountOnSurgeSkipped, totalCapacity, allocationUnitsPerNxm);

    return basePremium + surgePremium - surgePremiumSkipped;
  }

  // Calculates the premium for a given cover amount starting with the surge point
  function calculateSurgePremium(
    uint amountOnSurge,
    uint totalCapacity,
    uint allocationUnitsPerNxm
  ) public override pure returns (uint) {

    // for every percent of capacity used, the surge price has a +2% increase per annum
    // meaning a +200% increase for 100%, ie x2 for a whole unit (100%) of capacity in ratio terms
    //
    // coverToCapacityRatio = amountOnSurge / totalCapacity
    // surgePriceStart = 0
    // surgePriceEnd = SURGE_PRICE_RATIO * coverToCapacityRatio
    //
    // surgePremium = amountOnSurge * surgePriceEnd / 2
    //              = amountOnSurge * SURGE_PRICE_RATIO * coverToCapacityRatio / 2
    //              = amountOnSurge * SURGE_PRICE_RATIO * amountOnSurge / totalCapacity / 2

    uint surgePremium = amountOnSurge * SURGE_PRICE_RATIO * amountOnSurge / totalCapacity / 2;

    // amountOnSurge has two decimals
    // dividing by ALLOCATION_UNITS_PER_NXM (=100) to normalize the result
    return surgePremium / allocationUnitsPerNxm;
  }

  /* dependencies */

  function changeDependentContractAddress() external {
    // none :)
  }

}
