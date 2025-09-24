// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingPool.sol";
import "../../../interfaces/IStakingProducts.sol";
import "../../../interfaces/IStakingPoolFactory.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../generic/CoverGeneric.sol";

contract SPMockCover is CoverGeneric {

  uint public constant GLOBAL_CAPACITY_RATIO = 20000;
  uint public constant GLOBAL_REWARDS_RATIO = 5000;

  uint public lastPremium;

  mapping(uint => address) public stakingPool;

  ICoverNFT public _coverNFT;
  IStakingNFT public _stakingNFT;
  IStakingPoolFactory public _stakingPoolFactory;
  address public _stakingPoolImplementation;
  ICoverProducts coverProducts;

  error ProductDeprecatedOrNotInitialized();

  constructor(
    ICoverNFT coverNFTAddress,
    IStakingNFT stakingNFTAddress,
    IStakingPoolFactory stakingPoolFactoryAddress,
    address stakingPoolImplementationAddress,
    address _coverProducts
  ) {
    // in constructor we only initialize immutable fields
    _coverNFT = coverNFTAddress;
    _stakingNFT = stakingNFTAddress;
    _stakingPoolFactory = stakingPoolFactoryAddress;
    _stakingPoolImplementation = stakingPoolImplementationAddress;
    coverProducts = ICoverProducts(_coverProducts);
  }

  event RequestAllocationReturned(uint premium, uint allocationId);

  function setStakingPool(address addr, uint id) public {
    stakingPool[id] = addr;
  }

  function getDefaultMinPriceRatio() public override pure returns (uint) {
    return DEFAULT_MIN_PRICE_RATIO;
  }

  function getGlobalCapacityRatio() public override pure returns (uint) {
    return GLOBAL_CAPACITY_RATIO;
  }

  function getGlobalCapacityAndPriceRatios() public override pure returns (uint, uint) {
    return (GLOBAL_CAPACITY_RATIO, DEFAULT_MIN_PRICE_RATIO);
  }

  // TODO: remove me. see https://github.com/NexusMutual/smart-contracts/issues/1161
  function allocateCapacity(
    BuyCoverParams memory params,
    uint coverId,
    uint allocationId,
    IStakingPool _stakingPool
  ) public returns (uint premium, uint) {

    Product memory product = coverProducts.getProduct(params.productId);
    uint gracePeriod = coverProducts.getProductType(product.productType).gracePeriod;

    (premium, allocationId) = _stakingPool.requestAllocation(
      params.amount,
      AllocationRequest(
        params.productId,
        coverId,
        params.period,
        gracePeriod,
        product.useFixedPrice,
        GLOBAL_CAPACITY_RATIO,
        product.capacityReductionRatio,
        GLOBAL_REWARDS_RATIO,
        DEFAULT_MIN_PRICE_RATIO
      )
    );

    lastPremium = premium;

    return (premium, allocationId);
  }

  function requestAllocation (
    uint amount,
    AllocationRequest calldata allocationRequest,
    IStakingPool _stakingPool
  ) public returns (uint premium, uint allocationId)  {

    (premium, allocationId) = _stakingPool.requestAllocation(amount, allocationRequest);

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

  function stakingPoolImplementation() public override view returns (address) {
    return _stakingPoolImplementation;
  }
}
