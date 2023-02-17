// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";

contract ICMockCover {

  struct BurnStakeCalledWith {
    uint coverId;
    uint segmentId;
    uint amount;
  }

  ICoverNFT public immutable coverNFT;
  BurnStakeCalledWith public burnStakeCalledWith;

  mapping(uint => CoverData) public coverData;
  mapping(uint => CoverSegment[]) _coverSegments;

  mapping(uint => PoolAllocation[]) poolAllocations;
  mapping(uint => uint96) public activeCoverAmountInNXM;

  Product[] internal _products;
  mapping(uint => uint) capacityFactors;

  ProductType[] internal _productTypes;

  mapping(uint => uint) initialPrices;

  /*
   (productId, poolAddress) => lastPrice
   Last base prices at which a cover was sold by a pool for a particular product.
  */
  mapping(uint => mapping(address => uint)) lastPrices;

  /*
   (productId, poolAddress) => lastPriceUpdate
   Last base price update time.
  */
  mapping(uint => mapping(address => uint)) lastPriceUpdate;


  /* === CONSTANTS ==== */

  uint public REWARD_BPS = 5000;
  uint public constant PERCENTAGE_CHANGE_PER_DAY_BPS = 100;
  uint public constant BASIS_PRECISION = 10000;
  uint public constant STAKE_SPEED_UNIT = 100000e18;
  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;

  constructor(address coverNFTAddress) {
    coverNFT = ICoverNFT(coverNFTAddress);
  }

  function products(uint id) external view returns (Product memory) {
    return _products[id];
  }

  function productTypes(uint id) external view returns (ProductType memory) {
    return _productTypes[id];
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function createMockCover(
    address owner,
    uint24 productId,
    uint8 coverAsset,
    CoverSegment[] memory segments
  ) external payable returns (uint coverId) {

    coverId = coverNFT.mint(owner);

    coverData[coverId] = CoverData(
      productId,
      coverAsset,
      0
    );

    for (uint i = 0; i < segments.length; i++) {
      _coverSegments[coverId].push(segments[i]);
    }
  }

  function coverSegmentWithRemainingAmount(
    uint coverId,
    uint segmentId
  ) external view returns (CoverSegment memory) {
    CoverSegment memory segment = _coverSegments[coverId][segmentId];
    uint96 amountPaidOut = coverData[coverId].amountPaidOut;
    segment.amount = segment.amount >= amountPaidOut
      ? segment.amount - amountPaidOut
      : 0;
    return segment;
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

  function setActiveCoverAmountInNXM(
    uint productId,
    uint96 amount
  ) external {
    activeCoverAmountInNXM[productId] = amount;
  }


  function burnStake(uint coverId, uint segmentId, uint amount) external returns (address) {
    burnStakeCalledWith = BurnStakeCalledWith(coverId, segmentId, amount);
    return coverNFT.ownerOf(coverId);
  }
}
