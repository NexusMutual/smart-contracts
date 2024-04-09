// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ICover.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../../interfaces/ICoverNFT.sol";
import "../../generic/CoverProductsGeneric.sol";

contract CLMockCoverProducts is CoverProductsGeneric {

  Product[] internal _products;
  ProductType[] internal _productTypes;
  mapping(uint => uint) internal capacityFactors;
  string[] public _productNames;

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

  function productNames() external view returns (string[] memory) {
    return _productNames;
  }
}
