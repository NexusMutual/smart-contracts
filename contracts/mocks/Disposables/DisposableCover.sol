// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/IProductsV1.sol";
import "../../modules/cover/MinimalBeaconProxy.sol";

contract DisposableCover is MasterAwareV2 {

  /* ========== STATE VARIABLES ========== */

  Product[] public products;
  ProductType[] public productTypes;

  CoverData[] private coverData;
  mapping(uint => mapping(uint => PoolAllocation[])) public coverSegmentAllocations;

  /*
    Each Cover has an array of segments. A new segment is created everytime a cover is edited to
    deliniate the different cover periods.
  */
  mapping(uint => CoverSegment[]) coverSegments;

  uint24 public globalCapacityRatio;
  uint24 public globalRewardsRatio;
  uint64 public stakingPoolCounter;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint32 public coverAssetsFallback;

  function addProducts(Product[] calldata newProducts) public {
    for (uint i = 0; i < newProducts.length; i++) {
      products.push(newProducts[i]);
    }
  }

  function addProductTypes(ProductType[] calldata newProductTypes) public {
    for (uint i = 0; i < newProductTypes.length; i++) {
      productTypes.push(newProductTypes[i]);
    }
  }

  function setInitialPrices(
    uint[] calldata productIds,
    uint16[] calldata initialPriceRatios
  ) public {
    require(productIds.length == initialPriceRatios.length, "Cover: Array lengths must not be different");
    for (uint i = 0; i < productIds.length; i++) {
      products[productIds[i]].initialPriceRatio = initialPriceRatios[i];
    }
  }

  function setCoverAssetsFallback(uint32 _coverAssetsFallback) external {
    coverAssetsFallback = _coverAssetsFallback;
  }

  function changeDependentContractAddress() external override {}

}
