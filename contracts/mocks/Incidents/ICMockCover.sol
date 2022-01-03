// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/ICover.sol";
import "../../interfaces/IERC721Mock.sol";

contract ICMockCover {

  IERC721Mock public immutable coverNFT;

  ICover.CoverData[] public coverData;
  mapping(uint => ICover.CoverSegment[]) coverSegments;

  mapping(uint => ICover.PoolAllocation[]) poolAllocations;
  mapping(uint => uint96) public activeCoverAmountInNXM;

  ICover.Product[] public products;
  mapping(uint => uint) capacityFactors;

  ICover.ProductType[] public productTypes;

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

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    ICover.PoolAllocationRequest[] memory stakingPools
  ) external payable returns (uint coverId) {
    coverData.push(ICover.CoverData(
        productId,
        payoutAsset,
        0
      ));

    coverSegments[coverData.length - 1].push(ICover.CoverSegment(
        uint96(amount),
        uint32(block.timestamp + 1),
        uint32(period),
        uint16(0)
      ));

    coverId = coverData.length - 1;
    coverNFT.safeMint(owner, coverId);
  }

  function addProductType(
    string calldata descriptionIpfsHash,
    uint8 redeemMethod,
    uint16 gracePeriodInDays,
    uint16 burnRatio
  ) external {
    productTypes.push(ICover.ProductType(
      descriptionIpfsHash,
      redeemMethod,
      gracePeriodInDays
    ));
  }

  function addProduct(ICover.Product calldata product) external {
    products.push(product);
  }

  function setActiveCoverAmountInNXM(
    uint productId,
    uint96 amount
  ) external returns (uint96) {
    activeCoverAmountInNXM[productId] = amount;
  }


  function performPayoutBurn(uint coverId, uint amount) external returns (address) {
    // [todo] Return nft owner
    return 0x0000000000000000000000000000000000000000;
  }
}
