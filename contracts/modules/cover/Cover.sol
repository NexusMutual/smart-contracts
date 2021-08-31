
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IPool.sol";
import "../../abstract/MasterAwareV2.sol";


contract Cover is ICover, ERC721, MasterAwareV2 {

  Cover[] public override covers;
  Product[] public products;

  mapping(uint => uint) capacityFactors;
  mapping(uint => StakingPool[]) stakingPoolsForCover;

  mapping(uint => uint) initialPrices;

  mapping(uint => mapping(address => uint)) lastPrices;
  mapping(uint => mapping(address => uint)) lastPriceUpdate;

  address constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint public REWARD_BPS = 5000;

  uint constant STAKE_SPEED_UNIT = 100000e18;

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
    return _createCover(owner, productId, payoutAsset, 0, amount, period, maxPrice, stakingPools);
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
    return 0; // TODO: implement
  }

  function _createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint8 deniedClaims,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    StakingPool[] memory stakingPools
  ) internal returns (uint /*coverId*/) {

    uint amountToCover = amount;
    uint totalPrice = 0;
    for (uint i = 0; i < stakingPools.length; i++) {
      if (amountToCover == 0) {
        break;
      }

      IStakingPool stakingPool = IStakingPool(stakingPools[i].poolAddress);
      uint coveredAmount;
      uint price;
      (coveredAmount, price) = buyCoverFromPool(stakingPool, productId, amountToCover, period);
      amountToCover -= coveredAmount;
      totalPrice += price;
      stakingPoolsForCover[covers.length].push(StakingPool(address(stakingPool), uint96(coveredAmount)));
    }

    require(totalPrice <= maxPrice, "Cover: Price exceeds maxPrice");
    retrievePayment(totalPrice, payoutAsset);

    covers.push(Cover(
        productId,
        payoutAsset,
        deniedClaims,
        uint96(amount),
        uint32(block.timestamp + 1),
        uint32(period)
      ));

    _safeMint(msg.sender, covers.length - 1);

    return covers.length - 1;
  }

  function buyCoverFromPool(
    IStakingPool stakingPool,
    uint24 productId,
    uint amountToCover,
    uint32 period
  ) internal returns (uint, uint) {

    uint availableCapacity = stakingPool.getAvailableCapacity(productId, capacityFactors[productId]);

    uint coveredAmount;
    if (amountToCover > availableCapacity) {
      coveredAmount = availableCapacity;
    } else {
      coveredAmount = amountToCover;
    }

    uint capacityFactor = capacityFactors[productId];
    (uint pricePercentage, uint price) = getPrice(coveredAmount, period, productId, stakingPool);
    lastPrices[productId][address(stakingPool)] = pricePercentage;
    lastPriceUpdate[productId][address(stakingPool)] = block.timestamp;

    stakingPool.buyCover(
      productId,
      coveredAmount,
      REWARD_BPS * price / 10000,
      period,
      capacityFactor
    );

    stakingPoolsForCover[covers.length].push(StakingPool(address(stakingPool), uint96(coveredAmount)));

    return (coveredAmount, price);
  }

  function extendCover(
    uint coverId,
    uint32 period,
    uint96 amount,
    uint maxPrice,
    StakingPool[] memory stakingPools
  ) external returns (uint) {
    require(_isApprovedOrOwner(_msgSender(), coverId), "Cover: caller is not owner nor approved");

    Cover memory cover = covers[coverId];
    uint newCoverId = _createCover(
      ERC721.ownerOf(coverId),
      cover.productId,
      cover.payoutAsset,
      0, // deniedClaims
      amount,
      period,
      maxPrice,
      stakingPools
    );

    // make the cover expire at current block
    covers[coverId].period = uint32(block.timestamp) - cover.start;

    return newCoverId;
  }

  function incrementDeniedClaims(uint coverId) external override {
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external override {
    Cover memory cover = covers[coverId];
  }

  uint constant EXPONENT = 7;

  function getPrice(uint amount, uint period, uint productId, IStakingPool pool) public view returns (uint, uint) {

    uint basePrice = interpolatePrice(
      pool.getStake(productId),
      lastPrices[productId][address(pool)] != 0 ? lastPrices[productId][address(pool)] : initialPrices[productId],
      pool.getTargetPrice(productId),
      lastPriceUpdate[productId][address(pool)],
      block.timestamp
    );
    uint pricePercentage = calculatePrice(
      amount,
      basePrice,
      pool.getUsedCapacity(productId),
      pool.getAvailableCapacity(productId, capacityFactors[productId])
    );

    uint price = pricePercentage * amount * period / 365 days;
    return (pricePercentage, price);
  }

  function interpolatePrice(
    uint stakedNXM,
    uint lastPrice,
    uint targetPrice,
    uint lastPriceUpdate,
    uint now
  ) public pure returns (uint) {
    return (now - lastPriceUpdate) / 1 days * 1 / 100  * (stakedNXM / STAKE_SPEED_UNIT);
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
    uint basePrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {
    return calculatePriceIntegralAtPoint(
      basePrice,
      activeCover + amount,
      capacity
    ) -
    calculatePriceIntegralAtPoint(
      basePrice,
      activeCover,
      capacity
    );
  }

  function calculatePriceIntegralAtPoint(
    uint basePrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {
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
