// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";
import "../../modules/cover/CoverUtilsLib.sol";

contract SPMockCoverProducts {
  uint24 public constant globalCapacityRatio = 20000;
  uint256 public constant globalRewardsRatio = 5000;

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  mapping(uint => address) public stakingPool;
  mapping(uint256 => Product) public products;
  mapping(uint256 => ProductType) public productTypes;

  function setStakingPool(address addr, uint id) public {
    stakingPool[id] = addr;
  }

  function setProduct(Product memory product, uint256 id) public {
    products[id] = product;
  }

  function setProductType(ProductType calldata product, uint256 id) public {
    productTypes[id] = product;
  }


  function getPriceAndCapacityRatios(uint[] calldata productIds) public view returns (
    uint _globalCapacityRatio,
    uint _globalMinPriceRatio,
    uint[] memory _initialPrices,
    uint[] memory _capacityReductionRatios
  ) {
    _globalCapacityRatio = uint(globalCapacityRatio);
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
    uint256 coverId,
    IStakingPool _stakingPool
  ) public returns (uint256 coveredAmountInNXM, uint256 premiumInNXM, uint256 rewardsInNXM) {
    Product memory product = products[params.productId];
    uint256 gracePeriod = uint256(productTypes[product.productType].gracePeriodInDays) * 1 days;

    return _stakingPool.allocateStake(
      CoverRequest(
        coverId,
        params.productId,
        params.amount,
        params.period,
        gracePeriod,
        globalCapacityRatio,
        product.capacityReductionRatio,
        globalRewardsRatio
      )
    );
  }

  function initializeStaking(
    address _stakingPool,
    address _manager,
    bool _isPrivatePool,
    uint256 _initialPoolFee,
    uint256 _maxPoolFee,
    ProductInitializationParams[] memory params,
    uint256 _poolId
  ) external {

    for (uint i = 0; i < params.length; i++) {
      params[i].initialPrice = products[params[i].productId].initialPriceRatio;
      require(params[i].targetPrice >= GLOBAL_MIN_PRICE_RATIO, "CoverUtilsLib: Target price below GLOBAL_MIN_PRICE_RATIO");
    }
    IStakingPool(_stakingPool).initialize(_manager, _isPrivatePool, _initialPoolFee, _maxPoolFee, params, _poolId);
  }

  function performStakeBurn(address _stakingPool, uint productId, uint start, uint period, uint burnAmountInNXM) external {
    IStakingPool(_stakingPool).burnStake(productId, start, period, burnAmountInNXM);
  }
}
