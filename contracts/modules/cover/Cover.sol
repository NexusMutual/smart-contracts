
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

  Product[] public override products;
  mapping(uint => uint) capacityFactors;

  ProductType[] public override productTypes;

  mapping(uint => uint) initialPrices;

  mapping(uint => uint96) public override activeCoverAmountInNXM;

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

    (uint coverId, uint priceInAsset) = _createCover(owner, productId, payoutAsset, amount, period, stakingPools);
    require(priceInAsset <= maxPrice, "Cover: Price exceeds maxPrice");
    retrievePayment(priceInAsset, payoutAsset);
    return coverId;
  }

  function _createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    StakingPool[] memory stakingPools
  ) internal returns (uint coverId, uint premiumInAsset) {

    // convert to NXM amount
    uint amountLeftToCoverInNXM = uint(amount) * 1e18 / pool().getTokenPrice(pool().assets(payoutAsset));
    activeCoverAmountInNXM[productId] += uint96(amountLeftToCoverInNXM);

    uint totalPremiumInNXM = 0;

    for (uint i = 0; i < stakingPools.length; i++) {
      if (amountLeftToCoverInNXM == 0) {
        break;
      }

      IStakingPool stakingPool = IStakingPool(stakingPools[i].poolAddress);
      (uint coveredAmount, uint premiumInNXM) = buyCoverFromPool(stakingPool, productId, amountLeftToCoverInNXM, period);
      amountLeftToCoverInNXM -= coveredAmount;
      totalPremiumInNXM += premiumInNXM;
      stakingPoolsForCover[covers.length].push(
        StakingPool(address(stakingPool), uint96(coveredAmount), uint96(premiumInNXM))
      );
    }
    require(amountLeftToCoverInNXM == 0, "Not enough available capacity");

    premiumInAsset = totalPremiumInNXM * pool().getTokenPrice(pool().assets(payoutAsset)) / 1e18;

    covers.push(Cover(
        productId,
        payoutAsset,
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

    uint coveredAmount = amountToCover > availableCapacity ? availableCapacity : amountToCover;

    uint capacityFactor = capacityFactors[productId];
    (uint basePrice, uint premiumInNXM) = getPrice(coveredAmount, period, productId, stakingPool);
    lastPrices[productId][address(stakingPool)] = basePrice;
    lastPriceUpdate[productId][address(stakingPool)] = block.timestamp;

    stakingPool.buyCover(
      productId,
      coveredAmount,
      REWARD_BPS * premiumInNXM / BASIS_PRECISION,
      period,
      capacityFactor
    );

    stakingPoolsForCover[covers.length].push(
      StakingPool(address(stakingPool), uint96(coveredAmount), uint96(premiumInNXM))
    );

    return (coveredAmount, premiumInNXM);
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
      amount,
      period,
      stakingPools
    );

    // make the cover expire at current block
    uint32 newPeriod = uint32(block.timestamp) - cover.start;
    uint32 previousPeriod = covers[coverId].period;
    uint priceAlreadyPaid = (previousPeriod - newPeriod) / previousPeriod * cover.premium;
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
  ) external returns (uint) {

    (uint coverId, uint premiumInAsset) = _addAmount(coverId, amount, stakingPools);

    require(premiumInAsset <= maxPrice, "Cover: Price exceeds maxPrice");
    retrievePayment(premiumInAsset, covers[coverId].payoutAsset);
    return coverId;
  }

  function _addAmount(
    uint coverId,
    uint96 amount,
    StakingPool[] memory stakingPools
  ) internal returns (uint newCoverId, uint premiumInAsset) {

    Cover memory previousCover = covers[coverId];
    // clone the existing cover
    Cover memory cover = covers[coverId];

    StakingPool[] storage currentStakingPools = stakingPoolsForCover[covers.length];

    uint32 period = uint32(block.timestamp) - cover.start;
    // convert to NXM amount
    uint amountToCover = uint(amount) * 1e18 / pool().getTokenPrice(pool().assets(cover.payoutAsset));
    uint totalPremiumInNXM = 0;
    for (uint i = 0; i < stakingPools.length; i++) {
      if (amountToCover == 0) {
        break;
      }

      IStakingPool stakingPool = IStakingPool(stakingPools[i].poolAddress);
      (uint coveredAmount, uint premiumInNXM) = buyCoverFromPool(stakingPool, cover.productId, amountToCover, period);
      amountToCover -= coveredAmount;
      totalPremiumInNXM += premiumInNXM;

      uint j = 0;
      for ( ; j < currentStakingPools.length; j++) {
        if (currentStakingPools[j].poolAddress == stakingPools[i].poolAddress) {
          currentStakingPools[j].coverAmount += uint96(coveredAmount);
          currentStakingPools[j].premiumInNXM += uint96(premiumInNXM);
          break;
        }
      }

      if (j < currentStakingPools.length) {
        continue;
      }

      stakingPoolsForCover[covers.length].push(
        StakingPool(
          address(stakingPool),
          uint96(coveredAmount),
          uint96(premiumInNXM)
        ));
    }
    require(amountToCover == 0, "Not enough available capacity");

    premiumInAsset = totalPremiumInNXM * pool().getTokenPrice(pool().assets(cover.payoutAsset)) / 1e18;

    // make the previous cover expire at current block
    uint32 newPeriod = uint32(block.timestamp) - cover.start;
    uint32 previousPeriod = covers[coverId].period;

    cover.amount += amount;
    cover.premium += uint96(premiumInAsset);
    cover.start = uint32(block.timestamp);
    cover.period = uint32(block.timestamp) - previousCover.start;

    covers.push(cover);

    newCoverId = covers.length - 1;

    // mint the new cover
    _safeMint(msg.sender, newCoverId);
  }

  function addPeriod(uint coverId, uint32 extraPeriod, uint maxPrice) external {
    uint premiumInAsset = _addPeriod(coverId, extraPeriod);
    require(premiumInAsset <= maxPrice, "Cover: Price exceeds maxPrice");
    retrievePayment(premiumInAsset, covers[coverId].payoutAsset);
  }

  function _addPeriod(uint coverId, uint32 extraPeriod) internal returns (uint) {

    Cover storage cover = covers[coverId];
    StakingPool[] storage stakingPools = stakingPoolsForCover[covers.length];

    uint totalPremiumInNXM = 0;
    for (uint i = 0; i < stakingPools.length; i++) {
      IStakingPool stakingPool = IStakingPool(stakingPools[i].poolAddress);

      uint capacityFactor = capacityFactors[cover.productId];
      (uint basePrice, uint premiumInNXM) = getPrice(cover.productId, extraPeriod, cover.productId, stakingPool);
      lastPrices[cover.productId][address(stakingPool)] = basePrice;
      lastPriceUpdate[cover.productId][address(stakingPool)] = block.timestamp;

      stakingPool.extendPeriod(
        cover.productId,
        cover.period,
        cover.start,
        REWARD_BPS * stakingPools[i].premiumInNXM / BASIS_PRECISION,
        extraPeriod,
        REWARD_BPS * (stakingPools[i].premiumInNXM + premiumInNXM) / BASIS_PRECISION,
        cover.amount
      );

      totalPremiumInNXM += premiumInNXM;
      stakingPools[i].premiumInNXM += uint96(premiumInNXM);
    }

    uint premiumInAsset = totalPremiumInNXM * pool().getTokenPrice(pool().assets(cover.payoutAsset)) / 1e18;

    cover.period += extraPeriod;

    return premiumInAsset;
  }

  function addAmountAndReducePeriod(
    uint coverId,
    uint32 periodReduction,
    uint96 amount,
    uint maxPrice,
    StakingPool[] memory stakingPools
  ) external returns (uint) {

    Cover storage cover = covers[coverId];
    StakingPool[] storage currentStakingPools = stakingPoolsForCover[covers.length];

    // reduce period
    for (uint i = 0; i < currentStakingPools.length; i++) {
      IStakingPool stakingPool = IStakingPool(currentStakingPools[i].poolAddress);

      stakingPool.reducePeriod(
        cover.productId,
        cover.period,
        cover.start,
        REWARD_BPS * currentStakingPools[i].premiumInNXM / BASIS_PRECISION,
        periodReduction,
        cover.amount
      );

      currentStakingPools[i].premiumInNXM = currentStakingPools[i].premiumInNXM * (cover.period - periodReduction ) / cover.period;
    }

    uint refund = cover.premium * periodReduction / cover.period;

    // reduce the cover period before purchasing additional amount
    cover.period = cover.period - periodReduction;
    cover.premium = cover.premium - uint96(refund);

    (uint newCoverId, uint premiumInAsset) = _addAmount(coverId, amount, currentStakingPools);

    require(premiumInAsset <= maxPrice, "Cover: Price exceeds maxPrice");

    if (premiumInAsset > refund) {
      // retrieve extra required payment
      retrievePayment(premiumInAsset, cover.payoutAsset);
    }

    return newCoverId;
  }

  function addPeriodAndReduceAmount(
    uint coverId,
    uint32 extraPeriod,
    uint96 amountReduction,
    uint maxPrice,
    StakingPool[] memory stakingPools
  ) external {

    Cover storage cover = covers[coverId];
    StakingPool[] storage currentStakingPools = stakingPoolsForCover[covers.length];

    uint newCoverAmount = cover.amount - amountReduction;

    // reduce amount
    for (uint i = 0; i < currentStakingPools.length; i++) {
      IStakingPool stakingPool = IStakingPool(currentStakingPools[i].poolAddress);

      stakingPool.reduceAmount(
        cover.productId,
        cover.period,
        cover.start,
        REWARD_BPS * currentStakingPools[i].premiumInNXM / BASIS_PRECISION,
        newCoverAmount,
        REWARD_BPS * (currentStakingPools[i].premiumInNXM * newCoverAmount / cover.amount) / BASIS_PRECISION,
        cover.amount
      );

      currentStakingPools[i].premiumInNXM =
        uint96(uint(currentStakingPools[i].premiumInNXM) * newCoverAmount / cover.amount);
    }

    uint refund = cover.amount * amountReduction / cover.amount;

    uint premiumInAsset = _addPeriod(coverId, extraPeriod);
    require(premiumInAsset <= maxPrice, "Cover: Price exceeds maxPrice");

    if (premiumInAsset > refund) {
      // retrieve extra required payment
      retrievePayment(premiumInAsset, cover.payoutAsset);
    }
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external onlyInternal override {
    Cover memory cover = covers[coverId];
  }


  function retrievePayment(uint totalPrice, uint8 payoutAssetIndex) internal {

    if (payoutAssetIndex == 0) {
      require(msg.value >= totalPrice, "Cover: Insufficient ETH sent");
      uint remainder = msg.value - totalPrice;

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, "Cover: Returning ETH remainder to sender failed.");
      }
    } else {
      address payoutAsset = pool().assets(payoutAssetIndex);
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
