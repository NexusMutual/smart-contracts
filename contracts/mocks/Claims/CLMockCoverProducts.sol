// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";


contract CLMockCoverProducts {

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
}