// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";

contract DisposableCover is MasterAwareV2 {
  IQuotationData internal immutable quotationData;
  IProductsV1 internal immutable productsV1;

  bytes32 public immutable stakingPoolProxyCodeHash;
  address public immutable override coverNFT;

  /* ========== STATE VARIABLES ========== */

  Product[] public override products;
  ProductType[] public override productTypes;

  CoverData[] private coverData;
  mapping(uint => mapping(uint => PoolAllocation[])) public coverSegmentAllocations;

  /*
    Each Cover has an array of segments. A new segment is created everytime a cover is edited to
    deliniate the different cover periods.
  */
  mapping(uint => CoverSegment[]) coverSegments;

  uint24 public globalCapacityRatio;
  uint24 public globalRewardsRatio;

  address public override stakingPoolImplementation;
  uint64 public stakingPoolCounter;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint32 public coverAssetsFallback;

  /* ========== CONSTRUCTOR ========== */

  constructor() {
  }

  function initialize(address _coverNFT) public {
    require(coverNFT == address(0), "Cover: already initialized");
    coverNFT = _coverNFT;
  }

  function addProductType(ICover.ProductType calldata productType) public {
    productTypes.push(productType);
  }

  function addProduct(ICover.Product calldata product) public {
    products.push(product);
  }

  function setInitialPrice(uint productId, uint initialPrice) external {
    initialPrices[productId] = initialPrice;
  }

  function setCoverAssetsFallback(uint _coverAssetsFallback) external {
    coverAssetsFallback = _coverAssetsFallback;
  }

  function changeDependentContractAddress() external override {}

}
