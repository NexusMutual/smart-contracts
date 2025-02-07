// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ICover.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../../interfaces/ICoverNFT.sol";
import "../../generic/CoverProductsGeneric.sol";

contract CLMockCoverProducts is CoverProductsGeneric {

//  mapping(uint => CoverData) public _coverData;
//  mapping(uint => CoverSegment[]) private _coverSegments;
//
//  mapping(uint => PoolAllocation[]) private poolAllocations;
//  mapping(uint => uint96) public activeCoverAmountInNXM;

  Product[] internal _products;
  ProductType[] internal _productTypes;

//  mapping(uint => uint) private capacityFactors;
//
//
///* === CONSTANTS ==== */
//
//  uint public REWARD_BPS = 5000;
//  uint public constant PERCENTAGE_CHANGE_PER_DAY_BPS = 100;
//  uint public constant BASIS_PRECISION = 10000;
//  uint public constant STAKE_SPEED_UNIT = 100000e18;
//  uint public constant PRICE_CURVE_EXPONENT = 7;
//  uint public constant MAX_PRICE_PERCENTAGE = 1e20;
//

  /* ========== VIEWS ========== */

  function getProductWithType(uint productId) external override view returns (Product memory product, ProductType memory) {
    product = _products[productId];
    return (product, _productTypes[product.productType]);
  }

  function addProductType(
    ClaimMethod claimMethod,
    uint16 gracePeriod,
    uint16 /*burnRatio*/
  ) external {
    _productTypes.push(ProductType(claimMethod, gracePeriod));
  }

  function editProductTypes(
    uint[] calldata productTypeIds,
    uint32[] calldata gracePeriods,
    string[] calldata /* ipfsHash */
  ) external {
    for (uint i = 0; i < productTypeIds.length; i++) {
      _productTypes[productTypeIds[i]].gracePeriod = gracePeriods[i];
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
