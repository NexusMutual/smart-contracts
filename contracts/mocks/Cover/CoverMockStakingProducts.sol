// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/StakingPoolLibrary.sol";

contract CoverMockStakingProducts is IStakingProducts {

  mapping(uint => mapping(uint => StakedProduct)) private _products;

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  address public immutable coverContract;
  address public immutable tokenControllerContract;
  address public immutable coverProductsContract;
  address public immutable stakingPoolFactory;

  constructor(
    address _coverContract,
    address _stakingPoolFactory,
    address _tokenControllerContract,
    address _coverProductsContract
  ) {
    coverContract = _coverContract;
    stakingPoolFactory = _stakingPoolFactory;
    tokenControllerContract = _tokenControllerContract;
    coverProductsContract = _coverProductsContract;
  }

  function setProducts(uint /*poolId*/, StakedProductParam[] memory /*params*/) external pure {
    revert('CoverMockStakingProducts: Not callable');
  }

  function setInitialProducts(uint poolId, ProductInitializationParams[] memory params) public {
    for (uint i = 0; i < params.length; i++) {
      _products[poolId][params[i].productId] = StakedProduct({
        lastEffectiveWeight: params[i].weight,
        targetWeight: params[i].weight,
        targetPrice: params[i].targetPrice,
        bumpedPrice: params[i].initialPrice,
        bumpedPriceUpdateTime: uint32(block.timestamp)
      });
    }
  }

  function getProductTargetWeight(uint /*poolId*/, uint /*productId*/) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function getTotalTargetWeight(uint /*poolId*/) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function getTotalEffectiveWeight(uint /*poolId*/) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function getProduct(uint poolId, uint productId) external view returns (
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

  function getPremium(
    uint /*poolId*/,
    uint /*productId*/,
    uint /*period*/,
    uint /*coverAmount*/,
    uint /*initialCapacityUsed*/,
    uint /*totalCapacity*/,
    uint /*globalMinPrice*/,
    bool /*useFixedPrice*/,
    uint /*nxmPerAllocationUnit*/,
    uint /*allocationUnitsPerNxm*/
  ) external pure returns (uint /*premium*/) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function calculateFixedPricePremium(
    uint /*coverAmount*/,
    uint /*period*/,
    uint /*fixedPrice*/,
    uint /*nxmPerAllocationUnit*/,
    uint /*targetPriceDenominator*/
  ) external pure returns (uint) {
    revert('CoverMockStakingProducts: Not callable');
  }

  function calculatePremium(
    StakedProduct memory /*product*/,
    uint /*period*/,
    uint /*coverAmount*/,
    uint /*initialCapacityUsed*/,
    uint /*totalCapacity*/,
    uint /*targetPrice*/,
    uint /*currentBlockTimestamp*/,
    uint /*nxmPerAllocationUnit*/,
    uint /*allocationUnitsPerNxm*/,
    uint /*targetPriceDenominator*/
  ) external pure returns (uint /*premium*/, StakedProduct memory) {
    revert('CoverMockStakingProducts: calculatePremium Not callable');
  }

  function calculatePremiumPerYear(
    uint /*basePrice*/,
    uint /*coverAmount*/,
    uint /*initialCapacityUsed*/,
    uint /*totalCapacity*/,
    uint /*nxmPerAllocationUnit*/,
    uint /*allocationUnitsPerNxm*/,
    uint /*targetPriceDenominator*/
  ) external pure returns (uint) {
    revert('CoverMockStakingProducts: calculatePremiumPerYear Not callable');
  }

  function calculateSurgePremium(
    uint /*amountOnSurge*/,
    uint /*totalCapacity*/,
    uint /*allocationUnitsPerNxm*/
  ) external pure returns (uint) {
    revert('CoverMockStakingProducts: calculateSurgePremium Not callable');
  }

  function stakingPool(uint poolId) public view returns (IStakingPool stakingPoolAddress) {
    stakingPoolAddress = IStakingPool(StakingPoolLibrary.getAddress(stakingPoolFactory, poolId));
  }

  function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] memory productInitParams,
    string calldata ipfsDescriptionHash
  ) external returns (uint /*poolId*/, address /*stakingPoolAddress*/) {

    uint numProducts = productInitParams.length;

    // override with initial price and check if pool is allowed
    for (uint i = 0; i < numProducts; i++) {

      if (productInitParams[i].targetPrice < GLOBAL_MIN_PRICE_RATIO) {
        revert TargetPriceBelowGlobalMinPriceRatio();
      }

      uint productId = productInitParams[i].productId;

      ICoverProducts _coverProducts = coverProducts();
      // if there is a list of allowed pools for this product - this pool didn't exist yet so it's not in it
      if (_coverProducts.allowedPoolsCount(productId) > 0) {
        revert ICoverProducts.PoolNotAllowedForThisProduct(productId);
      }

      if (productId >= _coverProducts.productsCount()) {
        revert ProductDoesntExistOrIsDeprecated();
      }

      Product memory product = _coverProducts.products(productId);

      if (product.isDeprecated) {
        revert ProductDoesntExistOrIsDeprecated();
      }

      productInitParams[i].initialPrice = product.initialPriceRatio;
    }

    (uint poolId, address stakingPoolAddress) = IStakingPoolFactory(stakingPoolFactory).create(coverContract);

    IStakingPool(stakingPoolAddress).initialize(
      isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      poolId,
      ipfsDescriptionHash
    );

    tokenController().assignStakingPoolManager(poolId, msg.sender);

    setInitialProducts(poolId, productInitParams);

    return (poolId, stakingPoolAddress);
  }

  /* dependencies */

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(tokenControllerContract);
  }

  function cover() internal view returns (ICover) {
    return ICover(coverContract);
  }

  function coverProducts() internal view returns (ICoverProducts) {
    return ICoverProducts(coverProductsContract);
  }
}
