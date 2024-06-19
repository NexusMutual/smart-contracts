// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingPool.sol";
import "../../../interfaces/ICover.sol";
import "../../../interfaces/IStakingProducts.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../generic/CoverProductsGeneric.sol";

contract SKMockCoverProducts is CoverProductsGeneric {

  mapping(uint => Product) public _products;
  mapping(uint => ProductType) public _productTypes;
  mapping(uint => mapping(uint => bool)) public allowedPools;
  uint public productsCount;
  mapping(uint => uint)  private _allowedPoolsCount;

  function setProduct(Product memory _product, uint id) public {
    _products[id] = _product;
    productsCount++;
  }

  function allowedPoolsCount(uint productId) external view returns (uint) {
    return _allowedPoolsCount[productId];
  }

  function setProductType(ProductType calldata product, uint id) public {
    _productTypes[id] = product;
  }

  function setPoolAllowed(uint productId, uint poolId, bool allowed) external {
    allowedPools[productId][poolId] = allowed;
    _allowedPoolsCount[productId]++;
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
}
