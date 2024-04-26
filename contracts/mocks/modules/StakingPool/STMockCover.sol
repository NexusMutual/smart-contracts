// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingPool.sol";
import "../../../interfaces/ICover.sol";
import "../../generic/CoverGeneric.sol";

contract STMockCover is CoverGeneric {

  uint public constant _globalCapacityRatio = 20000;
  uint public constant _globalRewardsRatio = 5000;

  uint public lastPremium;

  mapping(uint => address) public stakingPool;
  mapping(uint => Product) public products;
  mapping(uint => ProductType) public _productTypes;

  event RequestAllocationReturned(uint premium, uint allocationId);

  function getGlobalRewardsRatio() public override pure returns (uint) {
    return _globalRewardsRatio;
  }

  function getGlobalCapacityRatio() public override pure returns (uint) {
    return _globalCapacityRatio;
  }

  function setStakingPool(address addr, uint id) public {
    stakingPool[id] = addr;
  }

  function getPriceAndCapacityRatios(uint[] calldata productIds) public override view returns (
    uint _globalCapacityRatioValue,
    uint _globalMinPriceRatioValue,
    uint[] memory _initialPrices,
    uint[] memory _capacityReductionRatios
  ) {

    _globalCapacityRatioValue = _globalCapacityRatio;
    _globalMinPriceRatioValue = GLOBAL_MIN_PRICE_RATIO;
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
    uint gracePeriod = _productTypes[product.productType].gracePeriod;

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
        _globalCapacityRatio,
        product.capacityReductionRatio,
        _globalRewardsRatio,
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

  function isPoolAllowed(uint /*productId*/, uint /*poolId*/) external pure returns (bool) {
    return true;
  }

  function globalCapacityRatio() external override pure returns (uint) {
    return _globalCapacityRatio;
  }

  function globalRewardsRatio() external override pure  returns (uint){
    return _globalRewardsRatio;
  }

  function productTypes(uint productType) external override virtual view returns (ProductType memory) {
    return _productTypes[productType];
  }
}
