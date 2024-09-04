// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../abstract/MasterAwareV2.sol";
import "../../abstract/Multicall.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/StakingPoolLibrary.sol";

contract StakingProducts is IStakingProducts, MasterAwareV2, Multicall {
  using SafeUintCast for uint;

  // pool id => product id => Product
  mapping(uint => mapping(uint => StakedProduct)) private _products;
  // pool id => { totalEffectiveWeight, totalTargetWeight }
  mapping(uint => Weights) public weights;

  // pool id => metadata
  mapping(uint => string) internal poolMetadata;

  address public immutable coverContract;
  address public immutable stakingPoolFactory;

  uint public constant SURGE_PRICE_RATIO = 2 ether;
  uint public constant SURGE_THRESHOLD_RATIO = 90_00; // 90.00%
  uint public constant SURGE_THRESHOLD_DENOMINATOR = 100_00; // 100.00%

  // base price bump
  // +0.2% for each 1% of capacity used, ie +20% for 100%
  uint public constant PRICE_BUMP_RATIO = 20_00; // 20%

  // bumped price smoothing
  // 0.5% per day
  uint public constant PRICE_CHANGE_PER_DAY = 200; // 2%

  uint public constant INITIAL_PRICE_DENOMINATOR = 100_00;
  uint public constant TARGET_PRICE_DENOMINATOR = 100_00;
  uint public constant MAX_TOTAL_WEIGHT = 20_00; // 20x

  // The 3 constants below are also used in the StakingPool contract
  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8; // 7 whole quarters + 1 partial quarter
  uint public constant WEIGHT_DENOMINATOR = 100;

  // denominators for cover contract parameters
  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 100_00;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 100_00;

  uint public constant ONE_NXM = 1 ether;
  uint public constant ALLOCATION_UNITS_PER_NXM = 100;
  uint public constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;

  modifier onlyManager(uint poolId) {
    if (msg.sender != getPoolManager(poolId)) {
      revert OnlyManager();
    }
    _;
  }

  constructor(address _coverContract, address _stakingPoolFactory) {
    coverContract = _coverContract;
    stakingPoolFactory = _stakingPoolFactory;
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

  function getPoolManager(uint poolId) public view override returns (address) {
    return tokenController().getStakingPoolManager(poolId);
  }

  function getPoolMetadata(uint poolId) external view override returns (string memory ipfsHash) {
    return poolMetadata[poolId];
  }

  function recalculateEffectiveWeights(uint poolId, uint[] calldata productIds) external {

    IStakingPool _stakingPool = stakingPool(poolId);

    uint[] memory capacityReductionRatios = coverProducts().getCapacityReductionRatios(productIds);
    uint globalCapacityRatio = cover().getGlobalCapacityRatio();

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

  function recalculateEffectiveWeightsForAllProducts(uint poolId) external {

    ICoverProducts _coverProducts = coverProducts();
    IStakingPool _stakingPool = stakingPool(poolId);

    uint productsCount = _coverProducts.getProductCount();

    // initialize array for all possible products
    uint[] memory productIdsRaw = new uint[](productsCount);
    uint stakingPoolProductCount;

    // filter out products that are not in this pool
    for (uint i = 0; i < productsCount; i++) {
      if (_products[poolId][i].bumpedPriceUpdateTime == 0) {
        continue;
      }
      productIdsRaw[stakingPoolProductCount++] = i;
    }

    // use resized array
    uint[] memory productIds = new uint[](stakingPoolProductCount);

    for (uint i = 0; i < stakingPoolProductCount; i++) {
      productIds[i] = productIdsRaw[i];
    }

    uint globalCapacityRatio = cover().getGlobalCapacityRatio();
    uint[] memory capacityReductionRatios = _coverProducts.getCapacityReductionRatios(productIds);

    uint _totalEffectiveWeight;

    for (uint i = 0; i < stakingPoolProductCount; i++) {
      uint productId = productIds[i];
      StakedProduct memory _product = _products[poolId][productId];

      // Get current effectiveWeight
      _product.lastEffectiveWeight = _getEffectiveWeight(
        _stakingPool,
        productId,
        _product.targetWeight,
        globalCapacityRatio,
        capacityReductionRatios[i]
      );
      _totalEffectiveWeight += _product.lastEffectiveWeight;
      _products[poolId][productId] = _product;
    }

    weights[poolId].totalEffectiveWeight = _totalEffectiveWeight.toUint32();
  }

  function setProducts(uint poolId, StakedProductParam[] memory params) external {

    IStakingPool _stakingPool = stakingPool(poolId);

    if (msg.sender != tokenController().getStakingPoolManager(poolId)) {
      revert OnlyManager();
    }

    (
      uint globalCapacityRatio,
      uint globalMinPriceRatio
    ) = ICover(coverContract).getGlobalCapacityAndPriceRatios();

    uint[] memory initialPriceRatios;
    uint[] memory capacityReductionRatios;

    {
      uint numProducts = params.length;
      uint[] memory productIds = new uint[](numProducts);

      for (uint i = 0; i < numProducts; i++) {
        productIds[i] = params[i].productId;
      }

      ICoverProducts _coverProducts = coverProducts();

      // reverts if poolId is not allowed for any of these products
      _coverProducts.requirePoolIsAllowed(productIds, poolId);

      initialPriceRatios = _coverProducts.getInitialPrices(productIds);
      capacityReductionRatios = _coverProducts.getCapacityReductionRatios(productIds);
    }

    Weights memory _weights = weights[poolId];
    bool targetWeightIncreased;

    for (uint i = 0; i < params.length; i++) {
      StakedProductParam memory _param = params[i];
      StakedProduct memory _product = _products[poolId][_param.productId];

      bool isNewProduct = _product.bumpedPriceUpdateTime == 0;

      // if this is a new product
      if (isNewProduct) {
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

        // if this is an existing product, when the target price is updated we need to calculate the
        // current base price using the old target price and update the bumped price to that value
        // uses the same logic as calculatePremium()
        if (!isNewProduct) {

          // apply price change per day towards previous target price
          uint newBumpedPrice = getBasePrice(
            _product.bumpedPrice,
            _product.bumpedPriceUpdateTime,
            _product.targetPrice,
            block.timestamp
          );

          // update product with new bumped price and bumped price update time
          _product.bumpedPrice = newBumpedPrice.toUint96();
          _product.bumpedPriceUpdateTime = block.timestamp.toUint32();
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

    uint activeStake = _stakingPool.getActiveStake();
    uint multiplier = globalCapacityRatio * (CAPACITY_REDUCTION_DENOMINATOR - capacityReductionRatio);
    uint denominator = GLOBAL_CAPACITY_DENOMINATOR * CAPACITY_REDUCTION_DENOMINATOR;
    uint totalCapacity = activeStake * multiplier / denominator / NXM_PER_ALLOCATION_UNIT;

    if (totalCapacity == 0) {
      return targetWeight.toUint16();
    }

    uint[] memory activeAllocations = _stakingPool.getActiveAllocations(productId);
    uint totalAllocation = Math.sum(activeAllocations);
    uint actualWeight = Math.min(totalAllocation * WEIGHT_DENOMINATOR / totalCapacity, type(uint16).max);

    return Math.max(targetWeight, actualWeight).toUint16();
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
  ) public returns (uint premium) {

    if (msg.sender != StakingPoolLibrary.getAddress(stakingPoolFactory, poolId)) {
      revert OnlyStakingPool();
    }

    StakedProduct memory product = _products[poolId][productId];
    uint targetPrice = Math.max(product.targetPrice, globalMinPrice);

    if (useFixedPrice) {
      return calculateFixedPricePremium(coverAmount, period, targetPrice, nxmPerAllocationUnit, TARGET_PRICE_DENOMINATOR);
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
  ) public pure returns (uint) {

    uint premiumPerYear =
    coverAmount
    * nxmPerAllocationUnit
    * fixedPrice
    / targetPriceDenominator;

    return premiumPerYear * period / 365 days;
  }

  function getBasePrice(
    uint productBumpedPrice,
    uint productBumpedPriceUpdateTime,
    uint targetPrice,
    uint timestamp
  ) public pure returns (uint basePrice) {

    // use previously recorded bumped price and apply time based smoothing towards target price
    uint timeSinceLastUpdate = timestamp - productBumpedPriceUpdateTime;
    uint priceDrop = PRICE_CHANGE_PER_DAY * timeSinceLastUpdate / 1 days;

    // basePrice = max(targetPrice, bumpedPrice - priceDrop)
    // rewritten to avoid underflow
    return productBumpedPrice < targetPrice + priceDrop
      ? targetPrice
      : productBumpedPrice - priceDrop;
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
  ) public pure returns (uint premium, StakedProduct memory) {

    // calculate the bumped price by applying the price bump
    uint priceBump = PRICE_BUMP_RATIO * coverAmount / totalCapacity;

    // apply change in price-per-day towards the target price
    uint basePrice = getBasePrice(
       product.bumpedPrice,
       product.bumpedPriceUpdateTime,
       targetPrice,
       currentBlockTimestamp
     );

    // update product with new bumped price and timestamp
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
  ) public pure returns (uint) {
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
  ) public pure returns (uint) {

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

  /* ========== STAKING POOL CREATION ========== */

  function stakingPool(uint poolId) public view returns (IStakingPool) {
    return IStakingPool(
      StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
    );
  }

  function getStakingPoolCount() external view returns (uint) {
    return IStakingPoolFactory(stakingPoolFactory).stakingPoolCount();
  }

  function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] memory productInitParams,
    string calldata ipfsHash
  ) external override whenNotPaused onlyMember returns (uint /*poolId*/, address /*stakingPoolAddress*/) {
    if (bytes(ipfsHash).length == 0) {
      revert IpfsHashRequired();
    }

    ICoverProducts _coverProducts = coverProducts();

    // create and initialize staking pool
    (uint poolId, address stakingPoolAddress) = ICompleteStakingPoolFactory(stakingPoolFactory).create(coverContract);
    IStakingPool(stakingPoolAddress).initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId);

    // assign pool manager
    tokenController().assignStakingPoolManager(poolId, msg.sender);

    // set products
    ProductInitializationParams[] memory initializedProducts = _coverProducts.prepareStakingProductsParams(
      productInitParams
    );
    _setInitialProducts(poolId, initializedProducts);

    // set metadata
    poolMetadata[poolId] = ipfsHash;

    return (poolId, stakingPoolAddress);
  }

  function _setInitialProducts(uint poolId, ProductInitializationParams[] memory params) internal {

    uint globalMinPriceRatio = cover().getGlobalMinPriceRatio();
    uint totalTargetWeight;

    for (uint i = 0; i < params.length; i++) {

      ProductInitializationParams memory param = params[i];

      if (params[i].targetPrice < globalMinPriceRatio) {
        revert TargetPriceBelowGlobalMinPriceRatio();
      }

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
      product.lastEffectiveWeight = param.weight;

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

  // future operator role transfers
  function changeStakingPoolFactoryOperator(address _operator) external onlyInternal {
    ICompleteStakingPoolFactory(stakingPoolFactory).changeOperator(_operator);
  }

  function setPoolMetadata(
    uint poolId,
    string calldata ipfsHash
  ) external override onlyManager(poolId) {
    if (bytes(ipfsHash).length == 0) {
      revert IpfsHashRequired();
    }
    poolMetadata[poolId] = ipfsHash;
  }

  // temporary migration function

  function setInitialMetadata(string[] calldata ipfsHashes) external onlyAdvisoryBoard {

    uint poolCount = IStakingPoolFactory(stakingPoolFactory).stakingPoolCount();
    require(ipfsHashes.length == poolCount, "StakingProducts: Metadata length mismatch");
    require(bytes(poolMetadata[1]).length == 0, "StakingProducts: Metadata already set");

    for (uint i = 0; i < poolCount; i++) {
      if (bytes(poolMetadata[i + 1]).length != 0) continue;
      poolMetadata[i + 1] = ipfsHashes[i];
    }
  }

  /* dependencies */

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function coverProducts() internal view returns (ICoverProducts) {
    return ICoverProducts(internalContracts[uint(ID.CP)]);
  }

  function cover() internal view returns (ICover) {
    return ICover(coverContract);
  }

  function changeDependentContractAddress() external {
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.CP)] = master.getLatestAddress("CP");
  }

}
