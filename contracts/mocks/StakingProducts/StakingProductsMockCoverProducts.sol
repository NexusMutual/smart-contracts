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

  function getInitialPrices(uint[] calldata /*productIds*/) external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function getAllowedPoolsCount(uint /* productId */) external pure returns (uint) {
    revert("Unsupported");
  }

  function getProducts() external pure returns (Product[] memory) {
    revert("Unsupported");
  }

  function getProductTypes() external pure returns (ProductType[] memory) {
    revert("Unsupported");
  }

  function getProductTypesCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function getCapacityReductionRatiosInitialPrices(
    uint[] calldata /* productIds */
  ) external pure returns (
    uint[] memory /* initialPrices */,
    uint[] memory /* capacityReductionRatios */
  ) {
    revert("Unsupported");
  }

  function getProductWithType(uint /* productId */) external pure returns (Product memory, ProductType memory) {
    revert("Unsupported");
  }

  function getAllowedPools(uint /* productId */) external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function getCapacityReductionRatios(uint[] calldata /* productIds */) external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function getProduct(uint /* productId */) external pure returns (Product memory) {
    revert("Unsupported");
  }

  function getProductCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function getProductName(uint /* productTypeId */) external pure returns (string memory) {
    revert("Unsupported");
  }

  function getProductType(uint /* productTypeId */) external pure returns (ProductType memory) {
    revert("Unsupported");
  }

  function getProductTypeCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function getProductTypeName(uint /* productTypeId */) external pure returns (string memory) {
    revert("Unsupported");
  }

  function productNames(uint) external pure returns (string memory) {
    revert("Unsupported");
  }

  function setProductTypes(ProductTypeParam[] calldata /*  productTypes */ ) external pure {
    revert("Unsupported");
  }

  function setProducts(ProductParam[] calldata /* params */ ) external pure {
    revert("Unsupported");
  }
}
