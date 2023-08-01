// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/IStakingPoolFactory.sol";

contract StakingProductsMockCoverProducts {

  mapping(uint => Product) public products;
  mapping(uint => ProductType) public productTypes;
  mapping(uint => mapping(uint => bool)) public allowedPools;
  uint public productsCount;
  mapping(uint => uint)  private _allowedPoolsCount;

  constructor(

  ) {
  }

  function setProduct(Product memory _product, uint id) public {
    products[id] = _product;
    productsCount++;
  }

  function allowedPoolsCount(uint productId) external view returns (uint) {
    return _allowedPoolsCount[productId];
  }

  function setProducts(Product[] memory _products, uint[] memory productIds) public {
    for (uint i = 0; i < _products.length; i++) {
      products[productIds[i]] = _products[i];
      productsCount++;
    }
  }

  function setProductType(ProductType calldata product, uint id) public {
    productTypes[id] = product;
  }

  function initializeStaking(
    address staking_,
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    uint _poolId,
    string calldata ipfsDescriptionHash
  ) external {

    IStakingPool(staking_).initialize(
      _isPrivatePool,
      _initialPoolFee,
      _maxPoolFee,
      _poolId,
      ipfsDescriptionHash
    );
  }

  function setPoolAllowed(uint productId, uint poolId, bool allowed) external {
    allowedPools[productId][poolId] = allowed;
    _allowedPoolsCount[productId]++;
  }

  function isPoolAllowed(uint productId, uint poolId) external view returns (bool) {
    return allowedPools[productId][poolId];
  }

  function requirePoolIsAllowed(uint[] calldata productIds, uint poolId) external view {
    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      if (!allowedPools[productId][poolId]) {
        revert ICover.PoolNotAllowedForThisProduct(productId);
      }
    }
  }
}
