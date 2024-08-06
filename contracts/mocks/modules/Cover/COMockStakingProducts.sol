// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingProducts.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../../interfaces/IStakingPoolFactory.sol";
import "../../../interfaces/ITokenController.sol";
import "../../../libraries/StakingPoolLibrary.sol";
import "../../generic/StakingProductsGeneric.sol";

contract COMockStakingProducts is StakingProductsGeneric {

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

  function stakingPool(uint poolId) public override view returns (IStakingPool stakingPoolAddress) {
    stakingPoolAddress = IStakingPool(StakingPoolLibrary.getAddress(stakingPoolFactory, poolId));
  }

  function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] memory productInitParams,
    string calldata /*ipfsDescriptionHash*/
  ) external override returns (uint /*poolId*/, address /*stakingPoolAddress*/) {

    uint numProducts = productInitParams.length;

    // override with initial price and check if pool is allowed
    for (uint i = 0; i < numProducts; i++) {

      if (productInitParams[i].targetPrice < GLOBAL_MIN_PRICE_RATIO) {
        revert TargetPriceBelowGlobalMinPriceRatio();
      }

      uint productId = productInitParams[i].productId;

      ICoverProducts _coverProducts = coverProducts();

      // if there is a list of allowed pools for this product - this pool didn't exist yet so it's not in it
      if (_coverProducts.getAllowedPoolsCount(productId) > 0) {
        revert ICoverProducts.PoolNotAllowedForThisProduct(productId);
      }

      if (productId >= _coverProducts.getProductCount()) {
        revert ProductDoesntExistOrIsDeprecated();
      }

      Product memory product = _coverProducts.getProduct(productId);

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
      poolId
    );

    tokenController().assignStakingPoolManager(poolId, msg.sender);

    setInitialProducts(poolId, productInitParams);

    return (poolId, stakingPoolAddress);
  }

  function getStakingPoolCount() external override pure returns (uint) {
    return 1;
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
