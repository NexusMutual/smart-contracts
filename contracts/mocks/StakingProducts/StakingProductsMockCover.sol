// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/IStakingPoolFactory.sol";

contract StakingProductsMockCover {

  uint public constant GLOBAL_CAPACITY_RATIO = 20000;
  uint public constant GLOBAL_REWARDS_RATIO = 5000;

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  uint public lastPremium;

  mapping(uint => address) public stakingPool;
  mapping(uint => Product) public products;
  mapping(uint => ProductType) public productTypes;
  mapping(uint => mapping(uint => bool)) public allowedPools;
  uint public productsCount;

  ICoverNFT public coverNFT;
  IStakingNFT public stakingNFT;
  IStakingPoolFactory public stakingPoolFactory;
  address public stakingPoolImplementation;

  error ProductDeprecatedOrNotInitialized();

  constructor(
    ICoverNFT _coverNFT,
    IStakingNFT _stakingNFT,
    IStakingPoolFactory _stakingPoolFactory,
    address _stakingPoolImplementation
  ) {
    // in constructor we only initialize immutable fields
    coverNFT = _coverNFT;
    stakingNFT = _stakingNFT;
    stakingPoolFactory = _stakingPoolFactory;
    stakingPoolImplementation = _stakingPoolImplementation;
  }

  event RequestAllocationReturned(uint premium, uint allocationId);

  function setStakingPool(address addr, uint id) public {
    stakingPool[id] = addr;
  }

  function setProduct(Product memory _product, uint id) public {
    products[id] = _product;
    productsCount++;
  }

  function setProducts(Product[] memory _products, uint[] memory productIds) public {
    for (uint i = 0; i < _products.length; i++) {
      products[productIds[i]] = _products[i];
      productsCount++;
    }
  }

  function setProductType(ProductType calldata product, uint id) public {
    productTypes[id] = product;
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
        GLOBAL_CAPACITY_RATIO,
        product.capacityReductionRatio,
        GLOBAL_REWARDS_RATIO,
        GLOBAL_MIN_PRICE_RATIO
      )
    );

    lastPremium = premium;

    return (premium, allocationId);
  }

  function requestAllocation (
    uint amount,
    uint previousPremium,
    AllocationRequest calldata allocationRequest,
    IStakingPool _stakingPool
  ) public returns (uint premium, uint allocationId)  {
    (premium, allocationId) = _stakingPool.requestAllocation(
      amount,
      previousPremium,
      allocationRequest
    );

    lastPremium = premium;

    return (premium, allocationId);
  }

  function callAllocateCapacity(IStakingPool _stakingPool, bytes memory data) public {
    // low level call to avoid stack too deep
    (bool ok, bytes memory result) = address(_stakingPool).call(data);

    if (!ok) {
      // https://ethereum.stackexchange.com/a/83577
      if (result.length < 68) revert();
      assembly { result := add(result, 0x04) }
      revert(abi.decode(result, (string)));
    }

    (uint premium, uint allocationId) = abi.decode(result, (uint, uint));

    emit RequestAllocationReturned(premium, allocationId);
  }

  function initializeStaking(
    address staking_,
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    uint _poolId,
    string calldata ipfsDescriptionHash
  ) external {

    IStakingPool(staking_).initialize(
      _isPrivatePool,
      _initialPoolFee,
      _maxPoolFee,
      _poolId,
      ipfsDescriptionHash
    );
  }

  error TargetPriceBelowGlobalMinPriceRatio();

  function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] memory productInitParams,
    string calldata ipfsDescriptionHash
  ) external returns (uint /*poolId*/, address /*stakingPoolAddress*/) {

    // override with initial price
    for (uint i = 0; i < productInitParams.length; i++) {

      uint productId = productInitParams[i].productId;
      productInitParams[i].initialPrice = products[productId].initialPriceRatio;

      if (productInitParams[i].targetPrice < GLOBAL_MIN_PRICE_RATIO) {
        revert TargetPriceBelowGlobalMinPriceRatio();
      }
    }

    (uint poolId, address stakingPoolAddress) = stakingPoolFactory.create(address(this));

    IStakingPool(stakingPoolAddress).initialize(
      isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      poolId,
      ipfsDescriptionHash
    );

    return (poolId, stakingPoolAddress);
  }

  function setPoolAllowed(uint productId, uint poolId, bool allowed) external {
    allowedPools[productId][poolId] = allowed;
  }

  function isPoolAllowed(uint productId, uint poolId) external view returns (bool) {
    return allowedPools[productId][poolId];
  }

  function getPriceAndCapacityRatios(uint[] calldata productIds) public view returns (
    uint _globalCapacityRatio,
    uint _globalMinPriceRatio,
    uint[] memory _initialPrices,
    uint[] memory _capacityReductionRatios
  ) {
    _globalMinPriceRatio = GLOBAL_MIN_PRICE_RATIO;
    _globalCapacityRatio = GLOBAL_CAPACITY_RATIO;
    _capacityReductionRatios = new uint[](productIds.length);
    _initialPrices = new uint[](productIds.length);

    for (uint i = 0; i < productIds.length; i++) {
      Product memory product = products[productIds[i]];
      if (product.initialPriceRatio == 0) {
        revert ProductDeprecatedOrNotInitialized();
      }
      _initialPrices[i] = uint(product.initialPriceRatio);
      _capacityReductionRatios[i] = uint(product.capacityReductionRatio);
    }
  }

  function requirePoolIsAllowed(uint[] calldata productIds, uint poolId) external view {
    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      if (!allowedPools[productId][poolId]) {
        revert ICover.PoolNotAllowedForThisProduct(productId);
      }
    }
  }
}
