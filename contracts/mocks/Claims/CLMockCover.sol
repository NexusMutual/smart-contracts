// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";

import "../../interfaces/ICover.sol";


contract CLMockCover is ICover, ERC721 {

  Cover[] public override covers;
  mapping(uint => StakingPool[]) stakingPoolsForCover;
  mapping(uint => uint96) public override activeCoverAmountInNXM;

  Product[] public override products;
  mapping(uint => uint) capacityFactors;

  ProductType[] public override productTypes;

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

  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCoverAtDate(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    StakingPool[] memory stakingPools,
    uint32 date
  ) external payable returns (uint coverId) {
    covers.push(Cover(
        productId,
        payoutAsset,
        uint96(amount),
        uint32(date + 1),
        uint32(period),
        uint96(0)
      ));

    coverId = covers.length - 1;
    _safeMint(owner, coverId);
  }

  function buyCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    StakingPool[] memory stakingPools
  ) external payable override returns (uint coverId) {
    covers.push(Cover(
        productId,
        payoutAsset,
        uint96(amount),
        uint32(block.timestamp + 1),
        uint32(period),
        uint96(0)
      ));

    coverId = covers.length - 1;
    _safeMint(owner, coverId);
  }

  function addProductType(
    string calldata descriptionIpfsHash,
    uint8 redeemMethod,
    uint16 gracePeriodInDays,
    uint16 burnRatio
  ) external {
    productTypes.push(ProductType(
    descriptionIpfsHash,
    redeemMethod,
    gracePeriodInDays,
    burnRatio
    ));
  }

  function addProduct(
    uint16 productType,
    address productAddress,
    uint16 capacityFactor,
    uint payoutAssets
  ) external {
    products.push(Product(
      productType,
      productAddress,
      payoutAssets
    ));
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external override {

  }
}
