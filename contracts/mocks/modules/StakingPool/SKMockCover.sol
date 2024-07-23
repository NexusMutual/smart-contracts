// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingPool.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../generic/CoverGeneric.sol";

contract SKMockCover is CoverGeneric {

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

  // TODO: get rid of this function https://github.com/NexusMutual/smart-contracts/issues/1161
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
}
