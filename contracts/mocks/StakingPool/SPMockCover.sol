// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";

contract SPMockCover {

  uint public constant globalCapacityRatio = 20000;
  uint public constant globalRewardsRatio = 5000;

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  uint public lastPremium;

  mapping(uint => address) public stakingPool;
  mapping(uint => Product) public products;
  mapping(uint => ProductType) public productTypes;

  function setStakingPool(address addr, uint id) public {
    stakingPool[id] = addr;
  }

  function setProduct(Product memory _product, uint id) public {
    products[id] = _product;
  }

  function setProducts(Product[] memory _products, uint[] memory productIds) public {
    for (uint i = 0; i < _products.length; i++) {
      products[productIds[i]] = _products[i];
    }
  }

  function setProductType(ProductType calldata product, uint id) public {
    productTypes[id] = product;
  }

  function getPriceAndCapacityRatios(uint[] calldata productIds) public view returns (
    uint _globalCapacityRatio,
    uint _globalMinPriceRatio,
    uint[] memory _initialPrices,
    uint[] memory _capacityReductionRatios
  ) {

    _globalCapacityRatio = globalCapacityRatio;
    _globalMinPriceRatio = GLOBAL_MIN_PRICE_RATIO;
    _capacityReductionRatios = new uint[](productIds.length);
    _initialPrices  = new uint[](productIds.length);

    for (uint i = 0; i < productIds.length; i++) {
      Product memory product = products[productIds[i]];
      require(product.initialPriceRatio > 0, "Cover: Product deprecated or not initialized");
      _initialPrices[i] = uint(product.initialPriceRatio);
      _capacityReductionRatios[i] = uint(product.capacityReductionRatio);
    }
  }

  function allocateCapacity(
    BuyCoverParams memory params,
    uint coverId,
    uint allocationId,
    IStakingPool _stakingPool
  ) public returns (uint premium, uint) {

    Product memory product = products[params.productId];
    uint gracePeriod = productTypes[product.productType].gracePeriod;

    (premium, allocationId) = _stakingPool.requestAllocation(
      params.amount,
      // TODO: figure out if these need to be populated
      0, // previousPremium
      AllocationRequest(
        params.productId,
        coverId,
        allocationId,
        params.period,
        gracePeriod,
        product.useFixedPrice,
        // TODO: figure out if these need to be populated
        0, // previous cover start
        0,  // previous cover expiration
        0,  // previous rewards ratio
        globalCapacityRatio,
        product.capacityReductionRatio,
        globalRewardsRatio,
        GLOBAL_MIN_PRICE_RATIO
      )
    );
    lastPremium = premium;
    lastPremium = premium;
    return (premium, allocationId);
  }

  function initializeStaking(
    address staking_,
    address _manager,
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    ProductInitializationParams[] memory params,
    uint _poolId,
    string calldata ipfsDescriptionHash
  ) external {

    for (uint i = 0; i < params.length; i++) {
      params[i].initialPrice = products[params[i].productId].initialPriceRatio;
      require(params[i].targetPrice >= GLOBAL_MIN_PRICE_RATIO, "Cover: Target price below GLOBAL_MIN_PRICE_RATIO");
    }

    IStakingPool(staking_).initialize(
      _manager,
      _isPrivatePool,
      _initialPoolFee,
      _maxPoolFee,
      params,
      _poolId,
      ipfsDescriptionHash
    );
  }

  function isPoolAllowed(uint /*productId*/, uint /*poolId*/) external pure returns (bool) {
    return true;
  }
}
