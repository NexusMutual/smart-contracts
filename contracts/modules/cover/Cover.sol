
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IPool.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMemberRoles.sol";
import "hardhat/console.sol";


contract Cover is ICover, ERC721, MasterAwareV2 {

  Cover[] public override covers;
  mapping(uint => StakingPool[]) stakingPoolsForCover;

  Product[] public products;
  mapping(uint => uint) capacityFactors;

  mapping(uint => uint) initialPrices;
  mapping(uint => mapping(address => uint)) lastPrices;
  mapping(uint => mapping(address => uint)) lastPriceUpdate;


  /* === CONSTANTS ==== */

  address constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint public REWARD_BPS = 5000;
  uint public constant PERCENTAGE_CHANGE_PER_DAY_BPS = 100;
  uint public constant BASIS_PRECISION = 10000;
  uint public constant STAKE_SPEED_UNIT = 100000e18;
  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;

  /* === MODIFIERS ==== */

  modifier onlyAdvisoryBoard {
    uint abRole = uint(IMemberRoles.Role.AdvisoryBoard);
    require(
      memberRoles().checkRole(msg.sender, abRole),
      "Cover: Caller is not an advisory board member"
    );
    _;
  }

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
    require(initialPrices[productId] != 0, "Cover: product not initialized");

    (uint coverId, uint priceInAsset) = _createCover(owner, productId, payoutAsset, 0, amount, period, stakingPools);
    require(priceInAsset <= maxPrice, "Cover: Price exceeds maxPrice");
    retrievePayment(priceInAsset, payoutAsset);
    return coverId;
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
    StakingPool[] memory stakingPools
  ) internal returns (uint coverId, uint premiumInAsset) {

    // convert to NXM amount
    uint amountToCover = uint(amount) * 1e18 / pool().getTokenPrice(pool().assets(payoutAsset));
    uint totalPremiumInNXM = 0;

    for (uint i = 0; i < stakingPools.length; i++) {
      if (amountToCover == 0) {
        break;
      }

      IStakingPool stakingPool = IStakingPool(stakingPools[i].poolAddress);
      (uint coveredAmount, uint price) = buyCoverFromPool(stakingPool, productId, amountToCover, period);
      amountToCover -= coveredAmount;
      totalPremiumInNXM += price;
      stakingPoolsForCover[covers.length].push(StakingPool(address(stakingPool), uint96(coveredAmount)));
    }
    require(amountToCover == 0, "Not enough available capacity");

    premiumInAsset = totalPremiumInNXM * pool().getTokenPrice(pool().assets(payoutAsset)) / 1e18;

    covers.push(Cover(
        productId,
        payoutAsset,
        deniedClaims,
        uint96(amount),
        uint32(block.timestamp + 1),
        uint32(period),
        uint96(premiumInAsset)
      ));

    coverId = covers.length - 1;
    _safeMint(msg.sender, coverId);
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
    (uint basePrice, uint price) = getPrice(coveredAmount, period, productId, stakingPool);
    lastPrices[productId][address(stakingPool)] = basePrice;
    lastPriceUpdate[productId][address(stakingPool)] = block.timestamp;

    stakingPool.buyCover(
      productId,
      coveredAmount,
      REWARD_BPS * price / BASIS_PRECISION,
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
    (uint newCoverId, uint priceInAsset) = _createCover(
      ERC721.ownerOf(coverId),
      cover.productId,
      cover.payoutAsset,
      0, // deniedClaims
      amount,
      period,
      stakingPools
    );

    // make the cover expire at current block
    uint32 newPeriod = uint32(block.timestamp) - cover.start;
    uint32 previousPeriod = covers[coverId].period;
    uint priceAlreadyPaid = (previousPeriod - newPeriod) / previousPeriod * cover.price;
    covers[coverId].period = newPeriod;

    if (priceInAsset > priceAlreadyPaid) {
      // get price for already paid asset
      uint priceToBePaid = priceInAsset - priceAlreadyPaid;
      require(priceToBePaid <= maxPrice, "Cover: Price exceeds maxPrice");
      retrievePayment(priceToBePaid, cover.payoutAsset);
    }

    return newCoverId;
  }

  function addAmount(
    uint coverId,
    uint96 amount,
    uint maxPrice,
    StakingPool[] memory stakingPools
  ) external {
    Cover memory cover = covers[coverId];

    uint32 period = uint32(block.timestamp) - cover.start;
    // convert to NXM amount
    uint amountToCover = uint(amount) * 1e18 / pool().getTokenPrice(pool().assets(cover.payoutAsset));
    uint totalPremiumInNXM = 0;
    for (uint i = 0; i < stakingPools.length; i++) {
      if (amountToCover == 0) {
        break;
      }

      IStakingPool stakingPool = IStakingPool(stakingPools[i].poolAddress);
      (uint coveredAmount, uint price) = buyCoverFromPool(stakingPool, cover.productId, amountToCover, period);
      amountToCover -= coveredAmount;
      totalPremiumInNXM += price;
      stakingPoolsForCover[covers.length].push(StakingPool(address(stakingPool), uint96(coveredAmount)));
    }
    require(amountToCover == 0, "Not enough available capacity");

    uint premiumInAsset = totalPremiumInNXM * pool().getTokenPrice(pool().assets(cover.payoutAsset)) / 1e18;

    require(premiumInAsset <= maxPrice, "Cover: Price exceeds maxPrice");
    retrievePayment(premiumInAsset, cover.payoutAsset);

    cover.amount += amount;
    cover.price += uint96(premiumInAsset);
  }

  function incrementDeniedClaims(uint coverId) external onlyInternal override {
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external onlyInternal override {
    Cover memory cover = covers[coverId];
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

  /* ========== PRICE CALCULATION ========== */

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
      pool.getCapacity(productId, capacityFactors[productId])
    );

    uint price = pricePercentage * amount * period / 365 days / MAX_PRICE_PERCENTAGE;
    return (basePrice, price);
  }

  /**
    Price changes towards targetPrice from lastPrice by maximum of 1% a day per every 100k NXM staked
  */
  function interpolatePrice(
    uint stakedNXM,
    uint lastPrice,
    uint targetPrice,
    uint lastPriceUpdate,
    uint now
  ) public pure returns (uint) {

    uint percentageChange = (now - lastPriceUpdate) / 1 days * (stakedNXM / STAKE_SPEED_UNIT) * PERCENTAGE_CHANGE_PER_DAY_BPS;
    if (targetPrice > lastPrice) {
      return lastPrice + (targetPrice - lastPrice) * percentageChange / BASIS_PRECISION;
    } else {
      return lastPrice - (lastPrice - targetPrice) * percentageChange / BASIS_PRECISION;
    }
  }

  function calculatePrice(
    uint amount,
    uint basePrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {
    return (calculatePriceIntegralAtPoint(
      basePrice,
      activeCover + amount,
      capacity
    ) -
    calculatePriceIntegralAtPoint(
      basePrice,
      activeCover,
      capacity
    )) / amount;
  }

  function calculatePriceIntegralAtPoint(
    uint basePrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {
    uint actualPrice = basePrice * activeCover;
    for (uint i = 0; i < PRICE_CURVE_EXPONENT; i++) {
      actualPrice = actualPrice * activeCover / capacity;
    }
    actualPrice = actualPrice / 8 + basePrice * activeCover;

    return actualPrice;
  }

  /* ========== PRODUCT CONFIGURATION ========== */

  function setCapacityFactor(uint productId, uint capacityFactor) external onlyAdvisoryBoard {
    capacityFactors[productId] = capacityFactor;
  }

  function setInitialPrice(uint productId, uint initialPrice) external onlyAdvisoryBoard {
    initialPrices[productId] = initialPrice;
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function changeDependentContractAddress() external override {
    master = INXMMaster(master);
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
  }
}
