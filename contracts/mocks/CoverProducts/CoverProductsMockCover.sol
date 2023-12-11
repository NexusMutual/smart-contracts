// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ILegacyCover.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../interfaces/ICoverProducts.sol";

contract CoverProductsMockCover is ILegacyCover {
  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  Product[] internal _products;
  ProductType[] internal _productTypes;

  mapping(uint => string) public productNames;
  mapping(uint => string) public productTypeNames;
  mapping(uint => uint[]) public _allowedPools;

  function setProductsAndProductTypes(
    Product[] memory products,
    ProductType[] memory productTypes,
    string[] memory _productNames,
    string[] memory _productTypeNames,
    uint[][] memory allowedPoolsList
  ) external {

    for (uint i = 0; i < products.length; i++) {
      _products.push(products[i]);
      productNames[i] = _productNames[i];
      _allowedPools[i] = allowedPoolsList[i];
    }

    for (uint i = 0; i < products.length; i++) {
      _productTypes.push(productTypes[i]);
      productTypeNames[i] = _productTypeNames[i];
    }
  }

  function coverData(uint /* coverId */) external pure returns (CoverData memory) {
    revert("Unsupported");
  }

  function coverDataCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function coverSegmentsCount(uint /* coverId */ ) external pure returns (uint) {
    revert("Unsupported");
  }

  function coverSegments(uint /* coverId */ ) external pure returns (CoverSegment[] memory) {
    revert("Unsupported");
  }

  function coverSegmentWithRemainingAmount(
    uint /* coverId */,
    uint /* segmentId */
  ) external pure returns (CoverSegment memory) {
    revert("Unsupported");
  }

  function totalActiveCoverInAsset(uint /* coverAsset */) external pure returns (uint) {
    revert("Unsupported");
  }

  function globalCapacityRatio() external pure returns (uint) {
    revert("Unsupported");
  }

  function globalRewardsRatio() external pure returns (uint) {
    revert("Unsupported");
  }

  function getPriceAndCapacityRatios(uint[] calldata /* productIds */) external pure returns (
    uint /* _globalCapacityRatio */,
    uint /* _globalMinPriceRatio */,
    uint[] memory /* _initialPriceRatios */,
    uint[] memory /* _capacityReductionRatios */
  ) {
    revert("Unsupported");
  }

  function getProducts() external view returns (Product[] memory) {
    return _products;
  }

  function getProductTypes() external view returns (ProductType[] memory) {
    return _productTypes;
  }

  function allowedPools(uint productId) external view returns (uint[] memory) {
    return _allowedPools[productId];
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function addLegacyCover(
    uint /* productId */,
    uint /* coverAsset */,
    uint /* amount */,
    uint /* start */,
    uint /* period */,
    address /* newOwner */
  ) external pure returns (uint /* coverId */) {
    revert("Unsupported");
  }

  function buyCover(
    BuyCoverParams calldata /* params */,
    PoolAllocationRequest[] calldata /* coverChunkRequests */
  ) external payable returns (uint /* coverId */ ) {
    revert("Unsupported");
  }

  function burnStake(
    uint /* coverId */,
    uint /* segmentId */,
    uint /* amount */
  ) external pure returns (address /* coverOwner */) {
    revert("Unsupported");
  }

  function coverNFT() external pure returns (ICoverNFT) {
    revert("Unsupported");
  }

  function stakingNFT() external pure returns (IStakingNFT) {
    revert("Unsupported");
  }

  function stakingPoolFactory() external pure returns (IStakingPoolFactory) {
    revert("Unsupported");
  }
}
