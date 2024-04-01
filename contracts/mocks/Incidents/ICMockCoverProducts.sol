// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/ICoverNFT.sol";

contract ICMockCoverProducts is ICoverProducts {

  struct BurnStakeCalledWith {
    uint coverId;
    uint segmentId;
    uint amount;
  }

  BurnStakeCalledWith public burnStakeCalledWith;

  mapping(uint => CoverData) public coverData;
  mapping(uint => CoverSegment[]) private _coverSegments;

  mapping(uint => PoolAllocation[]) private poolAllocations;
  mapping(uint => uint96) public activeCoverAmountInNXM;

  Product[] internal _products;
  mapping(uint => uint) private capacityFactors;

  ProductType[] internal _productTypes;


  /* === CONSTANTS ==== */

  uint public REWARD_BPS = 5000;
  uint public constant PERCENTAGE_CHANGE_PER_DAY_BPS = 100;
  uint public constant BASIS_PRECISION = 10000;
  uint public constant STAKE_SPEED_UNIT = 100000e18;
  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;

  /* ========== VIEWS ========== */

  function getProductWithType(uint productId)  external override view returns (Product memory product, ProductType memory) {
    product = _products[productId];
    return (product, _productTypes[product.productType]);
  }

  function addProductType(
    uint8 claimMethod,
    uint16 gracePeriod,
    uint16 /*burnRatio*/
  ) external {
    _productTypes.push(ProductType(
        claimMethod,
        gracePeriod
      ));
  }

  function editProductTypes(
    uint[] calldata productTypeIds,
    uint32[] calldata gracePeriods,
    string[] calldata ipfsHash
  ) external {
    ipfsHash;
    for (uint i = 0; i < productTypeIds.length; i++) {
      _productTypes[productTypeIds[i]].gracePeriod = gracePeriods[i];
    }
  }

  function addProduct(Product calldata product) external {
    _products.push(product);
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

  function getCapacityReductionRatiosInitialPrices(
    uint[] calldata /* productIds */
  ) external pure returns (
    uint[] memory /* initialPrices */,
    uint[] memory /* capacityReductionRatios */
  ) {
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

  function productNames(uint) external pure returns (string memory) {
    revert("Unsupported");
  }
}
