// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/ICover.sol";
import "../../interfaces/IERC721Mock.sol";

import "hardhat/console.sol";

contract ICMockCover {

  struct PerformPayoutBurnCalledWith {
    uint coverId;
    uint segmentId;
    uint amount;
  }

  IERC721Mock public immutable coverNFT;

  ICover.CoverData[] public coverData;
  PerformPayoutBurnCalledWith public performPayoutBurnCalledWith;
  mapping(uint => ICover.CoverSegment[]) _coverSegments;

  mapping(uint => ICover.PoolAllocation[]) poolAllocations;
  mapping(uint => uint96) public activeCoverAmountInNXM;

  ICover.Product[] public _products;
  mapping(uint => uint) capacityFactors;

  ICover.ProductType[] public _productTypes;

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

  function products(uint id) external view returns (ICover.Product memory) {
    return _products[id];
  }

  function productTypes(uint id) external view returns (ICover.ProductType memory) {
    return _productTypes[id];
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function createMockCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    ICover.CoverSegment[] memory segments
  ) external payable returns (uint coverId) {

    coverData.push(ICover.CoverData(
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

  function coverSegments(
    uint coverId,
    uint segmentId
  ) external view returns (ICover.CoverSegment memory) {
    ICover.CoverSegment memory segment = _coverSegments[coverId][segmentId];
    uint96 amountPaidOut = coverData[coverId].amountPaidOut;
    segment.amount = segment.amount >= amountPaidOut
      ? segment.amount - amountPaidOut
      : 0;
    return segment;
  }

  function addProductType(
    string calldata descriptionIpfsHash,
    uint8 redeemMethod,
    uint16 gracePeriodInDays,
    uint16 burnRatio
  ) external {
    _productTypes.push(ICover.ProductType(
      descriptionIpfsHash,
      redeemMethod,
      gracePeriodInDays
    ));
  }

  function addProduct(ICover.Product calldata product) external {
    _products.push(product);
  }

  function setActiveCoverAmountInNXM(
    uint productId,
    uint96 amount
  ) external returns (uint96) {
    activeCoverAmountInNXM[productId] = amount;
  }


  function performPayoutBurn(uint coverId, uint segmentId, uint amount) external returns (address) {
    performPayoutBurnCalledWith = PerformPayoutBurnCalledWith(coverId, segmentId, amount);
    return coverNFT.ownerOf(coverId);
  }
}
