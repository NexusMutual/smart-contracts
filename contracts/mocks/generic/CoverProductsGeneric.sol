// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/ICoverProducts.sol";

contract CoverProductsGeneric is ICoverProducts {

  /* ========== VIEWS ========== */

  function getProductType(uint) external virtual view returns (ProductType memory) {
    revert("Unsupported");
  }

  function getProductTypeName(uint) external virtual pure returns (string memory) {
    revert("Unsupported");
  }

  function getProductTypeCount() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getProductTypes() external virtual view returns (ProductType[] memory) {
    revert("Unsupported");
  }

  function getProduct(uint) external virtual view returns (Product memory) {
    revert("Unsupported");
  }

  function getProductName(uint) external virtual view returns (string memory) {
    revert("Unsupported");
  }

  function getProductCount() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getProducts() external virtual view returns (Product[] memory) {
    revert("Unsupported");
  }

  // add grace period function?
  function getProductWithType(uint) external virtual view returns (Product memory, ProductType memory) {
    revert("Unsupported");
  }

  function getLatestProductMetadata(uint) external virtual view returns (Metadata memory) {
    revert("Unsupported");
  }

  function getLatestProductTypeMetadata(uint) external virtual view returns (Metadata memory) {
    revert("Unsupported");
  }

  function getProductMetadata(uint) external virtual view returns (Metadata[] memory) {
    revert("Unsupported");
  }

  function getProductTypeMetadata(uint) external virtual view returns (Metadata[] memory) {
    revert("Unsupported");
  }

  function getAllowedPools(uint) external virtual view returns (uint[] memory) {
    revert("Unsupported");
  }

  function getAllowedPoolsCount(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function isPoolAllowed(uint, uint) external virtual view returns (bool) {
    revert("Unsupported");
  }

  function requirePoolIsAllowed(uint[] calldata, uint) external virtual view {
    revert("Unsupported");
  }

  function getCapacityReductionRatios(uint[] calldata) external virtual view returns (uint[] memory) {
    revert("Unsupported");
  }

  function getInitialPrices(uint[] calldata) external virtual view returns (uint[] memory) {
    revert("Unsupported");
  }

  function prepareStakingProductsParams(
    ProductInitializationParams[] calldata
  ) external virtual pure returns (
    ProductInitializationParams[] memory
  ) {
    revert("Unsupported");
  }

  // deprecated
  function productNames(uint) external virtual view returns (string memory) {
    revert("Unsupported");
  }

  function setProductTypes(ProductTypeParam[] calldata) external virtual view {
    revert("Unsupported");
  }

  function setProducts(ProductParam[] calldata) external virtual pure {
    revert("Unsupported");
  }
}
