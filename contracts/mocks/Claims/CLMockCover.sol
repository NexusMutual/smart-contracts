// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/ICover.sol";
import "../../interfaces/IERC721Mock.sol";


contract CLMockCover {

  IERC721Mock public immutable coverNFT;

  struct PerformPayoutBurnCalledWith {
    uint coverId;
    uint segmentId;
    uint amount;
  }

  struct MigrateCoverFromOwnerCalledWith {
    uint coverId;
    address fromOwner;
    address toNewOwner;
  }

  PerformPayoutBurnCalledWith public performPayoutBurnCalledWith;
  MigrateCoverFromOwnerCalledWith public migrateCoverFromOwnerCalledWith;
  CoverData[] public coverData;
  mapping(uint => CoverSegment[]) _coverSegments;
  mapping(uint => PoolAllocation[]) stakingPoolsForCover;

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
    coverNFT = IERC721Mock(coverNFTAddress);
  }

  function products(uint id) external view returns (Product memory) {
    return _products[id];
  }

  function productTypes(uint id) external view returns (ProductType memory) {
    return _productTypes[id];
  }


  /* === MUTATIVE FUNCTIONS ==== */

  function coverSegments(
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

  function createMockCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    CoverSegment[] memory segments
  ) external payable returns (uint coverId) {

    coverData.push(CoverData(
        productId,
        payoutAsset,
        0
      ));

    for (uint i = 0; i < segments.length; i++) {
      _coverSegments[coverData.length - 1].push(segments[i]);
    }

    coverId = coverData.length - 1;
    coverNFT.safeMint(owner, coverId);
  }

  function addProductType(
    string calldata descriptionIpfsHash,
    uint8 claimMethod,
    uint16 gracePeriodInDays,
    uint16 /*burnRatio*/
  ) external {
    _productTypes.push(ProductType(
      descriptionIpfsHash,
      claimMethod,
      gracePeriodInDays
    ));
  }

  function addProduct(Product calldata product) external {
    _products.push(product);
  }

  function performPayoutBurn(uint coverId, uint segmentId, uint amount) external returns (address) {
    performPayoutBurnCalledWith = PerformPayoutBurnCalledWith(coverId, segmentId, amount);
    return coverNFT.ownerOf(coverId);
  }

  function migrateCoverFromOwner(
    uint coverId,
    address fromOwner,
    address toNewOwner
  ) external returns (address) {
    migrateCoverFromOwnerCalledWith = MigrateCoverFromOwnerCalledWith(coverId, fromOwner, toNewOwner);
    // silence compiler warning:
    return address(0);
  }

}
