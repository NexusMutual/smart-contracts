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
  mapping(uint => CoverSegment[]) _coverSegments;

  mapping(uint => PoolAllocation[]) poolAllocations;
  mapping(uint => uint96) public activeCoverAmountInNXM;

  Product[] internal _products;
  mapping(uint => uint) capacityFactors;

  ProductType[] internal _productTypes;


  /* === CONSTANTS ==== */

  uint public REWARD_BPS = 5000;
  uint public constant PERCENTAGE_CHANGE_PER_DAY_BPS = 100;
  uint public constant BASIS_PRECISION = 10000;
  uint public constant STAKE_SPEED_UNIT = 100000e18;
  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;

  /* ========== VIEWS ========== */

  function products(uint id) external view returns (Product memory) {
    return _products[id];
  }

  function productTypes(uint id) external view returns (ProductType memory) {
    return _productTypes[id];
  }

  function productTypesCount() external view returns (uint) {
    return _productTypes.length;
  }

  function productsCount() public view returns (uint) {
    return _products.length;
  }

  function getProducts() external view returns (Product[] memory) {
    return _products;
  }

  function allowedPoolsCount(uint /* productId */) external pure returns (uint) {
    revert("Unsupported");
  }

  function getPriceAndCapacityRatios(uint[] calldata /* productIds */ ) external pure returns (
    uint[] memory /* _initialPrices */,
    uint[] memory /* _capacityReductionRatios */
  ) {
    revert("Unsupported");
  }

  function isPoolAllowed(uint /* productId */, uint /* poolId */) external pure returns (bool) {
    revert("Unsupported");
  }

  function productNames(uint /* productId */) external pure returns (string memory) {
    revert("Unsupported");
  }

  function getProductWithType(uint productId)  external override view returns (Product memory product, ProductType memory) {
    product = _products[productId];
    return (product, _productTypes[product.productType]);
  }


  function requirePoolIsAllowed(uint[] calldata /* productIds */, uint /* poolId */ ) external pure {
    revert("Unsupported");
  }

  function setProducts(ProductParam[] calldata /* params */ ) external pure {
    revert("Unsupported");
  }

  function setProductTypes(ProductTypeParam[] calldata /*  productTypes */ ) external pure {
    revert("Unsupported");
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
}
