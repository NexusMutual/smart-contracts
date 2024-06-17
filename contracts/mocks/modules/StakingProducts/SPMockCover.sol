// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingPool.sol";
import "../../../interfaces/ICover.sol";
import "../../../interfaces/IStakingProducts.sol";
import "../../../interfaces/IExtendedStakingPoolFactory.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../generic/CoverGeneric.sol";

contract SPMockCover is CoverGeneric {

  uint public constant GLOBAL_CAPACITY_RATIO = 20000;
  uint public constant GLOBAL_REWARDS_RATIO = 5000;

  uint public lastPremium;

  mapping(uint => address) public stakingPool;

  ICoverNFT public _coverNFT;
  IStakingNFT public _stakingNFT;
  IExtendedStakingPoolFactory public _stakingPoolFactory;
  address public _stakingPoolImplementation;
  ICoverProducts coverProducts;

  error ProductDeprecatedOrNotInitialized();

  constructor(
    ICoverNFT coverNFTAddress,
    IStakingNFT stakingNFTAddress,
    IExtendedStakingPoolFactory stakingPoolFactoryAddress,
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

  function getGlobalMinPriceRatio() public override pure returns (uint) {
    return GLOBAL_MIN_PRICE_RATIO;
  }

  function getGlobalCapacityRatio() public override pure returns (uint) {
    return GLOBAL_CAPACITY_RATIO;
  }

  function getGlobalCapacityAndPriceRatios() public override pure returns (uint, uint) {
    return (GLOBAL_CAPACITY_RATIO, GLOBAL_MIN_PRICE_RATIO);
  }

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

  function getPriceAndCapacityRatios(uint[] calldata productIds) public override view returns (
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
      Product memory product = coverProducts.getProduct(productIds[i]);
      if (product.initialPriceRatio == 0) {
        revert ProductDeprecatedOrNotInitialized();
      }
      _initialPrices[i] = uint(product.initialPriceRatio);
      _capacityReductionRatios[i] = uint(product.capacityReductionRatio);
    }
  }

  function stakingPoolImplementation() public view returns (address) {
    return _stakingPoolImplementation;
  }
}
