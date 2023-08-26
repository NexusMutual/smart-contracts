// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/ICoverNFT.sol";


contract CLMockCoverProducts is ICoverProducts {

  Product[] internal _products;
  mapping(uint => uint) capacityFactors;

  ProductType[] internal _productTypes;


  function products(uint id) external view returns (Product memory) {
    return _products[id];
  }

  function productTypes(uint id) external view returns (ProductType memory) {
    return _productTypes[id];
  }


  function addProductType(
    uint8 claimMethod,
    uint32 gracePeriod,
    uint16 /*burnRatio*/
  ) external {
    _productTypes.push(ProductType(
        claimMethod,
        gracePeriod
      ));
  }

  function addProduct(Product calldata product) external {
    _products.push(product);
  }

  function productsCount() external view returns (uint) {
    return _products.length;
  }

  function allowedPoolsCount(uint /* productId */ ) external pure returns (uint) {
    revert("Unsupported");
  }

  function isPoolAllowed(uint /* productId */, uint /* poolId */) external pure returns (bool) {
    revert("Unsupported");
  }

  function requirePoolIsAllowed(uint[] calldata /* productIds */, uint /* poolId */) external pure {
    revert("Unsupported");
  }

  function getProducts() external pure returns (Product[] memory) {
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