// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/ICover.sol";
import "../../interfaces/IERC721Mock.sol";


contract CLMockCover {

  IERC721Mock public immutable coverNFT;

  ICover.CoverData[] public covers;
  mapping(uint => ICover.CoverChunk[]) stakingPoolsForCover;
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

  function buyCoverAtDate(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    ICover.CoverChunkRequest[] memory coverChunkRequests,
    uint32 date
  ) external payable returns (uint coverId) {
    covers.push(ICover.CoverData(
        productId,
        payoutAsset,
        uint96(amount),
        uint32(date + 1),
        uint32(period),
        uint96(0)
      ));

    coverId = covers.length - 1;
    coverNFT.safeMint(owner, coverId);
  }

  function buyCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    ICover.CoverChunkRequest[] memory coverChunkRequests
  ) external payable returns (uint coverId) {
    covers.push(ICover.CoverData(
        productId,
        payoutAsset,
        uint96(amount),
        uint32(block.timestamp + 1),
        uint32(period),
        uint96(0)
      ));

    coverId = covers.length - 1;
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

  function addProduct(
    uint16 productType,
    address productAddress,
    uint16 capacityFactor,
    uint payoutAssets
  ) external {
    products.push(ICover.Product(
      productType,
      productAddress,
      payoutAssets
    ));
  }

  function performPayoutBurn(uint coverId, uint amount) external returns (address) {
    // [todo] Return nft owner
    return 0x0000000000000000000000000000000000000000;
  }
}
