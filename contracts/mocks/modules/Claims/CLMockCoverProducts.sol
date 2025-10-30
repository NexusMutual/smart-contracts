// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ICover.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../../interfaces/ICoverNFT.sol";
import "../../generic/CoverProductsGeneric.sol";

contract CLMockCoverProducts is CoverProductsGeneric {

  Product[] internal _products;
  ProductType[] internal _productTypes;

  /* ========== VIEWS ========== */

  function getProductWithType(uint productId) external override view returns (Product memory product, ProductType memory) {
    product = _products[productId];
    return (product, _productTypes[product.productType]);
  }

  function addProductType(
    ClaimMethod claimMethod,
    uint32 gracePeriod,
    uint32 cooldownPeriod,
    uint32 redemptionPeriod
  ) external {
    _productTypes.push(ProductType(claimMethod, gracePeriod, cooldownPeriod, redemptionPeriod));
  }

  function editProductTypes(
    uint[] calldata productTypeIds,
    ProductType[] calldata productTypes,
    string[] calldata /* ipfsHash */
  ) external {
    for (uint i = 0; i < productTypeIds.length; i++) {
      _productTypes[productTypeIds[i]] = productTypes[i];
    }
  }

  function addProduct(Product calldata product) external {
    _products.push(product);
  }

  function getProduct(uint productId) external override view returns (Product memory) {
    return _products[productId];
  }

  function getProductType(uint productTypeId) external override view returns (ProductType memory) {
    return _productTypes[productTypeId];
  }

  function getProductTypeOf(uint productId) external override view returns (ProductType memory) {
    return _productTypes[_products[productId].productType];
  }
}
