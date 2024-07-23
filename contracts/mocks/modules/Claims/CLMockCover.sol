// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ICover.sol";
import "../../../interfaces/ICoverNFT.sol";
import "../../generic/CoverGeneric.sol";


contract CLMockCover is CoverGeneric {

  ICoverNFT public immutable _coverNFT;

  struct BurnStakeCalledWith {
    uint coverId;
    uint segmentId;
    uint amount;
  }

  struct MigrateCoverFromCalledWith {
    uint coverId;
    address from;
    address newOwner;
  }

  BurnStakeCalledWith public burnStakeCalledWith;
  MigrateCoverFromCalledWith public migrateCoverFromCalledWith;

  mapping(uint => CoverData) public _coverData;
  mapping(uint => CoverSegment[]) _coverSegments;
  mapping(uint => PoolAllocation[]) stakingPoolsForCover;

  mapping(uint => uint96) public activeCoverAmountInNXM;

  mapping(uint => uint) capacityFactors;

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
    _coverNFT = ICoverNFT(coverNFTAddress);
  }

  function coverData(uint id) external override view returns (CoverData memory) {
    return _coverData[id];
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function coverSegmentWithRemainingAmount(
    uint coverId,
    uint segmentId
  ) external override view returns (CoverSegment memory) {
    CoverSegment memory segment = _coverSegments[coverId][segmentId];
    uint96 amountPaidOut = _coverData[coverId].amountPaidOut;
    segment.amount = segment.amount >= amountPaidOut
      ? segment.amount - amountPaidOut
      : 0;
    return segment;
  }

  function createMockCover(
    address owner,
    uint24 productId,
    uint8 coverAsset,
    CoverSegment[] memory segments
  ) external payable returns (uint coverId) {

    coverId = _coverNFT.mint(owner);

    _coverData[coverId] = CoverData(
      productId,
      coverAsset,
      0
    );

    for (uint i = 0; i < segments.length; i++) {
      _coverSegments[coverId].push(segments[i]);
    }
  }

  function burnStake(uint coverId, uint segmentId, uint amount) external override returns (address) {
    burnStakeCalledWith = BurnStakeCalledWith(coverId, segmentId, amount);
    return _coverNFT.ownerOf(coverId);
  }

  function migrateCoverFrom(
    uint coverId,
    address from,
    address newOwner
  ) external returns (address) {
    migrateCoverFromCalledWith = MigrateCoverFromCalledWith(coverId, from, newOwner);
    // silence compiler warning:
    return address(0);
  }

  function coverNFT() external override view returns (ICoverNFT) {
    return _coverNFT;
  }
}
