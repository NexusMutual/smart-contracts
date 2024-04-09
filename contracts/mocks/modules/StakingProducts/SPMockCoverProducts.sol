// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

//import "../../../interfaces/IStakingPool.sol";
//import "../../../interfaces/ICover.sol";
//import "../../../interfaces/IStakingProducts.sol";
import "../../generic/CoverProductsGeneric.sol";
//import "../../../interfaces/IStakingPoolFactory.sol";

contract SPMockCoverProducts is CoverProductsGeneric {

  mapping(uint => Product) public _products;
  mapping(uint => ProductType) public _productTypes;
  mapping(uint => mapping(uint => bool)) public allowedPools;

  uint private productsCount;
  mapping(uint => uint) private _allowedPoolsCount;

  function setProduct(Product memory _product, uint id) public {
    _products[id] = _product;
    productsCount++;
  }

  function getProduct(uint productId) external override view returns (Product memory) {
    return _products[productId];
  }

  function getProductCount() external override view returns (uint) {
    return productsCount;
  }

  function allowedPoolsCount(uint productId) external view returns (uint) {
    return _allowedPoolsCount[productId];
  }

  function setProductType(ProductType calldata productType, uint id) public {
    _productTypes[id] = productType;
  }

  function getProductType(uint productTypeId) external override view returns (ProductType memory) {
    return _productTypes[productTypeId];
  }

  function setPoolAllowed(uint productId, uint poolId, bool allowed) external {
    bool wasAllowed = allowedPools[productId][poolId];
    allowedPools[productId][poolId] = allowed;

    if (!wasAllowed && allowed) {
      _allowedPoolsCount[productId]++;
    }

    if (wasAllowed && !allowed) {
      _allowedPoolsCount[productId]--;
    }
  }

  function isPoolAllowed(uint productId, uint poolId) external override view returns (bool) {
    return allowedPools[productId][poolId];
  }

  function requirePoolIsAllowed(uint[] calldata productIds, uint poolId) external override view {
    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      if (!allowedPools[productId][poolId]) {
        revert PoolNotAllowedForThisProduct(productId);
      }
    }
  }

  function getAllowedPoolsCount(uint productId) external override view returns (uint) {
    return _allowedPoolsCount[productId];
  }

  function prepareStakingProductsParams(
    ProductInitializationParams[] calldata params
  ) external override pure returns (
    ProductInitializationParams[] memory validatedParams
  ) {
    validatedParams = params;
  }

  function getInitialPrices(uint[] calldata productIds) external override view returns (uint[] memory initialPrices) {
    initialPrices = new uint[](productIds.length);
    for (uint i = 0; i < productIds.length; i++) {
      initialPrices[i] = _products[productIds[i]].initialPriceRatio;
    }
  }

  function getCapacityReductionRatios(uint[] calldata productIds) external override view returns (uint[] memory reductionRatios) {
    reductionRatios = new uint[](productIds.length);
    for (uint i = 0; i < productIds.length; i++) {
      reductionRatios[i] = _products[productIds[i]].capacityReductionRatio;
    }
  }
}
