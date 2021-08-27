
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingPool.sol";


contract Cover is ICover, ERC721 {

  Cover[] public override covers;

  mapping(uint => uint) capacityFactors;
  mapping(uint => StakingPool[]) usedPools;

  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    StakingPool[] memory stakingPools
  ) external override returns (uint /*coverId*/) {

    uint amountToCover = amount;
    for (uint i = 0; i < stakingPools.length; i++) {
      if (amountToCover == 0) {
        break;
      }

      IStakingPool stakingPool = IStakingPool(stakingPools[i].poolAddress);

      uint availableCapacity = stakingPool.getAvailableCapacity(productId, capacityFactors[i]);

      uint coveredAmount;
      if (amountToCover > availableCapacity) {
        amountToCover -= availableCapacity;
        coveredAmount = availableCapacity;
      } else {
        coveredAmount = amountToCover;
        amountToCover = 0;
      }

      stakingPools[i].bookedAmount = uint96(coveredAmount);

      stakingPool.buyCover(
        productId,
        coveredAmount,
        0, //rewardAmount,
        period,
        0 //capacityFactors[productId]
      );

      usedPools[covers.length].push(StakingPool(address(stakingPool), uint96(coveredAmount)));
    }

    covers.push(Cover(
      productId,
      payoutAsset,
      0,
      uint96(amount),
      uint32(block.timestamp + 1),
      uint32(period)
    ));

    _safeMint(msg.sender, covers.length - 1);

    return 0;
  }

  function createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint8 deniedClaims,
    uint96 amount,
    uint32 period,
    StakingPool[] calldata stakingPools
  ) external override returns (uint /*coverId*/) {

    return 0;
  }

  function extendCover(
    uint coverId,
    uint duration,
    uint amount,
    uint maxPrice
  ) external returns (uint) {
    return 0;
  }

  function incrementDeniedClaims(uint coverId) external override {
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external override {

  }

  uint constant EXPONENT = 7;

  function calculatePrice(
    uint amount,
    uint period,
    uint lastPrice,
    uint targetPrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {

    uint basePrice = (lastPrice + targetPrice) / 2; // TODO: interpolate
    uint actualPrice = basePrice * activeCover;
    for (uint i = 0; i < EXPONENT; i++) {
      actualPrice = actualPrice * activeCover / capacity;
    }
    actualPrice = actualPrice / 8 + basePrice * activeCover;

    return actualPrice;
  }
}
