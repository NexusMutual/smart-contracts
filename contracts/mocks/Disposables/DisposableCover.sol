// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/IProductsV1.sol";
import "../../modules/cover/MinimalBeaconProxy.sol";

contract DisposableCover is MasterAwareV2, ReentrancyGuard {

  /* ========== STATE VARIABLES ========== */

  Product[] internal _products;
  ProductType[] internal _productTypes;

  CoverData[] private _coverData;
  mapping(uint => mapping(uint => PoolAllocation[])) public coverSegmentAllocations;

  /*
    Each Cover has an array of segments. A new segment is created everytime a cover is edited to
    deliniate the different cover periods.
  */
  mapping(uint => CoverSegment[]) private _coverSegments;


  uint24 public globalCapacityRatio;
  uint24 public globalRewardsRatio;
  uint64 public stakingPoolCount;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint32 public coverAssetsFallback;

  // Global active cover amount per asset.
  mapping(uint24 => uint) public totalActiveCoverInAsset;

  bool public coverAmountTrackingEnabled;
  bool public activeCoverAmountCommitted;

  function addProducts(
    Product[] calldata newProducts,
    string[] calldata ipfsMetadata
  ) external {
    uint initialProuctsCount = _products.length;
    for (uint i = 0; i < newProducts.length; i++) {
      _products.push(newProducts[i]);
      emit ProductUpserted(initialProuctsCount + i, ipfsMetadata[i]);
    }
  }

  function addProductTypes(
    ProductType[] calldata newProductTypes,
    string[] calldata ipfsMetadata
  ) public {
    uint initialProuctTypesCount = _productTypes.length;
    for (uint i = 0; i < newProductTypes.length; i++) {
      _productTypes.push(newProductTypes[i]);
      emit ProductTypeUpserted(initialProuctTypesCount + i, ipfsMetadata[i]);
    }
  }

  function setInitialPrices(
    uint[] calldata productIds,
    uint16[] calldata initialPriceRatios
  ) public {
    require(productIds.length == initialPriceRatios.length, "Cover: Array lengths must not be different");
    for (uint i = 0; i < productIds.length; i++) {
      _products[productIds[i]].initialPriceRatio = initialPriceRatios[i];
    }
  }

  function setCoverAssetsFallback(uint32 _coverAssetsFallback) external {
    coverAssetsFallback = _coverAssetsFallback;
  }

  function changeDependentContractAddress() external override {}

  event ProductTypeUpserted(uint id, string ipfsMetadata);
  event ProductUpserted(uint id, string ipfsMetadata);
}
