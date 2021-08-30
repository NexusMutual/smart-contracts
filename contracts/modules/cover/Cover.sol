
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IPool.sol";
import "../../abstract/MasterAwareV2.sol";


contract Cover is ICover, ERC721, MasterAwareV2 {

  Cover[] public override covers;

  mapping(uint => uint) capacityFactors;
  mapping(uint => StakingPool[]) usedPools;

  mapping(uint => uint) lastPrices;

  address constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

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
  ) external payable override returns (uint /*coverId*/) {

    uint amountToCover = amount;
    uint totalPrice = 0;
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

      totalPrice += getPrice(coveredAmount, period, productId, stakingPool);

      stakingPools[i].bookedAmount = uint96(coveredAmount);

      stakingPool.buyCover(
        productId,
        coveredAmount,
        0, //rewardAmount, TODO: fill in
        period,
        0 //capacityFactors[productId] // TODO: solve stack too deep
      );

      usedPools[covers.length].push(StakingPool(address(stakingPool), uint96(coveredAmount)));
    }

    require(totalPrice <= maxPrice, "Cover: Price exceeds maxPrice");
    retrievePayment(totalPrice, payoutAsset);

    covers.push(Cover(
      productId,
      payoutAsset,
      0, // denied claims
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


  function getPrice(uint amount, uint period, uint productId, IStakingPool pool) public view returns (uint) {
    return calculatePrice(
      amount,
      period,
      lastPrices[productId],
      pool.getTargetPrice(productId, amount, period),
      pool.getUsedCapacity(productId),
      pool.getAvailableCapacity(productId, capacityFactors[productId])
    );
  }

  function retrievePayment(uint totalPrice, uint8 payoutAssetIndex) internal {
    address payoutAsset = pool().assets(payoutAssetIndex);
    if (payoutAsset == ETH) {
      require(msg.value >= totalPrice, "Cover: Insufficient ETH sent");
      uint remainder = msg.value - totalPrice;

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, "Cover: Returning ETH remainder to sender failed.");
      }
    } else {
      IERC20 token = IERC20(payoutAsset);
      token.transferFrom(msg.sender, address(this), totalPrice);
    }
  }

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

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function changeDependentContractAddress() external override {
    master = INXMMaster(master);
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
  }
}
