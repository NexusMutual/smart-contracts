// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IStakingPoolFactory.sol";

contract StakingProductsMockCoverProducts is ICoverProducts {

  mapping(uint => Product) public _products;
  mapping(uint => ProductType) public _productTypes;
  mapping(uint => mapping(uint => bool)) public allowedPools;
  uint public productsCount;
  mapping(uint => uint)  private _allowedPoolsCount;

  constructor(

  ) {
  }

  function setProduct(Product memory _product, uint id) public {
    _products[id] = _product;
    productsCount++;
  }

  function allowedPoolsCount(uint productId) external view returns (uint) {
    return _allowedPoolsCount[productId];
  }

//  function setProducts(Product[] memory newProducts, uint[] memory productIds) public {
//    for (uint i = 0; i < newProducts.length; i++) {
//      _products[productIds[i]] = newProducts[i];
//      productsCount++;
//    }
//  }

  function setProductType(ProductType calldata product, uint id) public {
    _productTypes[id] = product;
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
        revert PoolNotAllowedForThisProduct(productId);
      }
    }
  }

  function products(uint id) external view returns (Product memory) {
    return _products[id];
  }

  function productTypes(uint id) external view returns (ProductType memory) {
    return _productTypes[id];
  }

  function getProducts() external pure returns (Product[] memory) {
    revert("Unsupported");
  }

  function getProductTypes() external pure returns (ProductType[] memory) {
    revert("Unsupported");
  }

  function productTypesCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function getPriceAndCapacityRatios(uint[] calldata /* productIds */ ) external pure returns (
    uint[] memory /* _initialPrices */,
    uint[] memory /* _capacityReductionRatios */
  ) {
    revert("Unsupported");
  }

  function productNames(uint /* productId */) external pure returns (string memory) {
    revert("Unsupported");
  }

  function getProductWithType(uint /* productId */ )  external pure returns (Product memory, ProductType memory) {
    revert("Unsupported");
  }

  function setProductTypes(ProductTypeParam[] calldata /*  productTypes */ ) external pure {
    revert("Unsupported");
  }

  function setProducts(ProductParam[] calldata /* params */ ) external pure {
    revert("Unsupported");
  }
}
