// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/ICoverNFT.sol";

contract CLMockCoverProducts is ICoverProducts {

  Product[] internal _products;
  ProductType[] internal _productTypes;
  mapping(uint => uint) internal capacityFactors;
  string[] public productNames;

  function getProductTypes(uint id) external view returns (ProductType memory) {
    return _productTypes[id];
  }

  function addProductType(
    uint8 claimMethod,
    uint32 gracePeriod,
    uint16 /*burnRatio*/
  ) external {
    _productTypes.push(
      ProductType(claimMethod, gracePeriod)
    );
  }

  function addProduct(Product calldata product) external {
    _products.push(product);
  }

  function prepareStakingProductsParams(
    ProductInitializationParams[] calldata /* params */
  ) external pure returns (
    ProductInitializationParams[] memory /* validatedParams */
  ) {
    revert("Unsupported");
  }

  function setProductTypes(ProductTypeParam[] calldata /*  productTypes */) external pure {
    revert("Unsupported");
  }

  function setProducts(ProductParam[] calldata /* params */) external pure {
    revert("Unsupported");
  }

  function getInitialPrices(uint[] calldata /*productIds*/) external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function getAllowedPools(uint /* productId */) external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function getAllowedPoolsCount(uint /* productId */) external pure returns (uint) {
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

  function getProductTypes() external pure returns (ProductType[] memory) {
    revert("Unsupported");
  }

  function getProductTypesCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function getProductWithType(uint /* productId */) external pure returns (Product memory, ProductType memory) {
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
}
