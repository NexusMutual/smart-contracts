pragma solidity ^0.8.0;

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";
import "../../modules/cover/CoverUtilsLib.sol";

contract SPMockCoverProducts {
  uint24 public constant globalCapacityRatio = 2;
  uint256 public constant globalRewardsRatio = 1;

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

  function getCapacityRatios(uint[] calldata productIds) public view returns (uint24 _globalCapacityRatio, uint16[] memory capacityReductionRatios) {
    _globalCapacityRatio = globalCapacityRatio;
    capacityReductionRatios = new uint16[](productIds.length);
    for (uint i = 0; i < productIds.length; i++) {
      capacityReductionRatios[i] = products[productIds[i]].capacityReductionRatio;
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
    address staking_,
    address _manager,
    bool _isPrivatePool,
    uint256 _initialPoolFee,
    uint256 _maxPoolFee,
    ProductInitializationParams[] calldata params,
    uint256 _poolId
  ) external {
    IStakingPool(staking_).initialize(_manager, _isPrivatePool, _initialPoolFee, _maxPoolFee, params, _poolId);
  }
}
