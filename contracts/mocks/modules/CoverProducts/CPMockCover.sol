// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingPool.sol";
import "../../../interfaces/ICover.sol";
import "../../../interfaces/IStakingProducts.sol";
import "../../../interfaces/IStakingPoolFactory.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../generic/CoverGeneric.sol";

contract CPMockCover is CoverGeneric {

  Product[] internal _products;
  ProductType[] internal _productTypes;

  mapping(uint => string) public productNames;
  mapping(uint => string) public productTypeNames;
  mapping(uint => uint[]) public _allowedPools;

  function setProductsAndProductTypes(
    Product[] memory products,
    ProductType[] memory productTypeArray,
    string[] memory _productNames,
    string[] memory _productTypeNames,
    uint[][] memory allowedPoolsList
  ) external override {

    for (uint i = 0; i < products.length; i++) {
      _products.push(products[i]);
      productNames[i] = _productNames[i];
      _allowedPools[i] = allowedPoolsList[i];
    }

    for (uint i = 0; i < products.length; i++) {
      _productTypes.push(productTypeArray[i]);
      productTypeNames[i] = _productTypeNames[i];
    }
  }

  function getGlobalMinPriceRatio() public override pure returns (uint) {
    return GLOBAL_MIN_PRICE_RATIO;
  }

  function getProducts() external override view returns (Product[] memory) {
    return _products;
  }

  function productTypesCount() external override view returns (uint) {
    return _productTypes.length;
  }

  function productTypes(uint id) external override view returns (ProductType memory) {
    return _productTypes[id];
  }

  function allowedPools(uint productId) external override view returns (uint[] memory) {
    return _allowedPools[productId];
  }
}
