
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IPool.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMemberRoles.sol";


contract Cover is ICover, ERC721, MasterAwareV2 {

  CoverData[] public override covers;
  mapping(uint => CoverChunk[]) coverChunksForCover;

  Product[] public override products;

  uint public capacityFactor;
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
    uint maxPremiumInAsset,
    CoverChunkRequest[] memory coverChunkRequests
  ) external payable override onlyMember returns (uint /*coverId*/) {
    require(initialPrices[productId] != 0, "Cover: product not initialized");

    uint amountLeftToCoverInNXM;
    uint tokenPrice;
    {
      IPool pool = pool();
      // convert to NXM amount
      tokenPrice = pool.getTokenPrice(pool.assets(payoutAsset));
      amountLeftToCoverInNXM = uint(amount) * 1e18 / tokenPrice;
      activeCoverAmountInNXM[productId] += uint96(amountLeftToCoverInNXM);
    }

    uint totalPremiumInNXM = 0;

    for (uint i = 0; i < coverChunkRequests.length; i++) {
      if (amountLeftToCoverInNXM == 0) {
        break;
      }

      uint requestedCoverAmountInNXM = coverChunkRequests[i].coverAmountInAsset * 1e18 / tokenPrice;
      (uint coveredAmountInNXM, uint premiumInNXM) = buyCoverFromPool(
        IStakingPool(coverChunkRequests[i].poolAddress),
        productId,
        requestedCoverAmountInNXM,
        period
      );

      // TODO: re-enable
      //      // carry over the amount that was not covered by the current pool to the next cover
      //      if (coveredAmountInNXM < requestedCoverAmountInNXM && i + 1 < coverChunkRequests.length) {
      //
      //        // TODO: convert to asset
      //        coverChunkRequests[i + 1].coverAmountInAsset += requestedCoverAmountInNXM - uint96(coveredAmountInNXM);
      //      }

      amountLeftToCoverInNXM -= coveredAmountInNXM;
      totalPremiumInNXM += premiumInNXM;
      coverChunksForCover[covers.length].push(
        CoverChunk(coverChunkRequests[i].poolAddress, uint96(coveredAmountInNXM), uint96(premiumInNXM))
      );
    }
    require(amountLeftToCoverInNXM == 0, "Not enough available capacity");

    uint premiumInAsset = totalPremiumInNXM * tokenPrice / 1e18;

    covers.push(CoverData(
        productId,
        payoutAsset,
        uint96(amount),
        uint32(block.timestamp + 1),
        uint32(period),
        uint96(premiumInAsset)
      ));

    uint coverId = covers.length - 1;
    _safeMint(owner, coverId);

    require(premiumInAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");
    retrievePayment(premiumInAsset, payoutAsset);
    return coverId;
  }

  function buyCoverFromPool(
    IStakingPool stakingPool,
    uint24 productId,
    uint amountToCover,
    uint32 period
  ) internal returns (uint, uint) {

    uint availableCapacity = stakingPool.getAvailableCapacity(productId, capacityFactor);

    uint coveredAmount = amountToCover > availableCapacity ? availableCapacity : amountToCover;

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

    coverChunksForCover[covers.length].push(
      CoverChunk(address(stakingPool), uint96(coveredAmount), uint96(premiumInNXM))
    );

    return (coveredAmount, premiumInNXM);
  }

  function increaseAmount(
    uint coverId,
    uint96 amount,
    uint maxPremiumInAsset,
    CoverChunkRequest[] calldata coverChunkRequests
  ) external payable onlyMember returns (uint) {

    require(msg.sender == ERC721.ownerOf(coverId), "Cover: not cover owner");

    (uint coverId, uint premiumInAsset) = _increaseAmount(coverId, amount, coverChunkRequests);

    require(premiumInAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");
    retrievePayment(premiumInAsset, covers[coverId].payoutAsset);
    return coverId;
  }

  function _increaseAmount(
    uint coverId,
    uint96 amount,
    CoverChunkRequest[] calldata coverChunkRequests
  ) internal returns (uint newCoverId, uint premiumInAsset) {

    CoverData storage originalCover = covers[coverId];

    CoverChunk[] storage originalPools = coverChunksForCover[covers.length];

    uint tokenPrice;
    {
      IPool _pool = pool();
      tokenPrice = _pool.getTokenPrice(_pool.assets(originalCover.payoutAsset));
    }

    uint32 remainingPeriod = originalCover.start + originalCover.period - uint32(block.timestamp);
    // convert to NXM amount
    uint amountToCover = uint(amount) * 1e18 / tokenPrice;
    uint totalPremiumInNXM = 0;
    for (uint i = 0; i < coverChunkRequests.length; i++) {
      if (amountToCover == 0) {
        break;
      }

      uint requestedCoverAmountInNXM = coverChunkRequests[i].coverAmountInAsset * 1e18 / tokenPrice;
      (uint coveredAmount, uint premiumInNXM) = buyCoverFromPool(
        IStakingPool(coverChunkRequests[i].poolAddress),
        originalCover.productId,
        requestedCoverAmountInNXM,
        remainingPeriod
      );

      amountToCover -= coveredAmount;
      totalPremiumInNXM += premiumInNXM;

      uint j = 0;
      for ( ; j < originalPools.length; j++) {
        if (originalPools[j].poolAddress == coverChunkRequests[i].poolAddress) {
          originalPools[j].coverAmountInNXM += uint96(coveredAmount);
          originalPools[j].premiumInNXM += uint96(premiumInNXM);
          break;
        }
      }

      if (j < originalPools.length) {
        continue;
      }
      
      coverChunksForCover[covers.length].push(
        CoverChunk(
          coverChunkRequests[i].poolAddress,
          uint96(coveredAmount),
          uint96(premiumInNXM)
        ));
    }
    require(amountToCover == 0, "Not enough available capacity");

    {
      IPool pool = pool();
      premiumInAsset = totalPremiumInNXM * tokenPrice / 1e18;
    }

    // make the previous cover expire at current block
    uint32 elapsedPeriod = originalCover.period - remainingPeriod;
    uint96 updatedOriginalPremium = originalCover.premium * elapsedPeriod / originalCover.period;
    uint96 carriedPremium = originalCover.premium - updatedOriginalPremium;

    originalCover.period = elapsedPeriod;
    covers[coverId].premium = updatedOriginalPremium;

    covers.push(
      CoverData(
        originalCover.productId,
        originalCover.payoutAsset,
        originalCover.amount + amount,
        uint32(block.timestamp), // start
        remainingPeriod,
        uint96(premiumInAsset + carriedPremium)
      )
    );

    newCoverId = covers.length - 1;

    // mint the new cover
    _safeMint(msg.sender, newCoverId);
  }

  function increasePeriod(uint coverId, uint32 extraPeriod, uint maxPremiumInAsset) external payable onlyMember {

    require(msg.sender == ERC721.ownerOf(coverId), "Cover: not cover owner");
    uint premiumInAsset = _increasePeriod(coverId, extraPeriod);
    require(premiumInAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    retrievePayment(premiumInAsset, covers[coverId].payoutAsset);
  }

  function _increasePeriod(uint coverId, uint32 extraPeriod) internal returns (uint) {

    CoverData storage cover = covers[coverId];
    CoverChunk[] storage coverChunks = coverChunksForCover[covers.length];

    uint extraPremiumInNXM = 0;
    for (uint i = 0; i < coverChunks.length; i++) {
      IStakingPool stakingPool = IStakingPool(coverChunks[i].poolAddress);

      (uint basePrice, uint premiumInNXM) = getPrice(coverChunks[i].coverAmountInNXM, extraPeriod, cover.productId, stakingPool);
      lastPrices[cover.productId][address(stakingPool)] = basePrice;
      lastPriceUpdate[cover.productId][address(stakingPool)] = block.timestamp;

      stakingPool.extendPeriod(
        cover.productId,
        cover.period,
        cover.start,
        REWARD_BPS * coverChunks[i].premiumInNXM / BASIS_PRECISION,
        extraPeriod,
        REWARD_BPS * (coverChunks[i].premiumInNXM + premiumInNXM) / BASIS_PRECISION,
        cover.amount
      );

      extraPremiumInNXM += premiumInNXM;
      coverChunks[i].premiumInNXM += uint96(premiumInNXM);
    }

    uint premiumInAsset = extraPremiumInNXM * pool().getTokenPrice(pool().assets(cover.payoutAsset)) / 1e18;

    cover.period += extraPeriod;

    return premiumInAsset;
  }

  function increaseAmountAndReducePeriod(
    uint coverId,
    uint32 periodReduction,
    uint96 amount,
    uint maxPremiumInAsset,
    CoverChunkRequest[] calldata coverChunkRequests
  ) external payable onlyMember returns (uint) {

    require(msg.sender == ERC721.ownerOf(coverId), "Cover: not cover owner");

    CoverData storage cover = covers[coverId];

    require(cover.period - (block.timestamp - cover.start) > periodReduction, "Cover: periodReduction > remaining period");

    CoverChunk[] storage originalCoverChunks = coverChunksForCover[covers.length];

    // reduce period
    for (uint i = 0; i < originalCoverChunks.length; i++) {
      IStakingPool stakingPool = IStakingPool(originalCoverChunks[i].poolAddress);

      stakingPool.reducePeriod(
        cover.productId,
        cover.period,
        cover.start,
        REWARD_BPS * originalCoverChunks[i].premiumInNXM / BASIS_PRECISION,
        periodReduction,
        originalCoverChunks[i].coverAmountInNXM
      );

      originalCoverChunks[i].premiumInNXM = originalCoverChunks[i].premiumInNXM * (cover.period - periodReduction) / cover.period;
    }

    uint refund = cover.premium * periodReduction / cover.period;

    // reduce the cover period before purchasing additional amount
    cover.period = cover.period - periodReduction;
    cover.premium = cover.premium - uint96(refund);

    (uint newCoverId, uint premiumInAsset) = _increaseAmount(coverId, amount, coverChunkRequests);

    require(premiumInAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    if (premiumInAsset > refund) {
      // retrieve extra required payment
      retrievePayment(premiumInAsset - refund, cover.payoutAsset);
    }

    return newCoverId;
  }

  function increasePeriodAndReduceAmount(
    uint coverId,
    uint32 extraPeriod,
    uint96 amountReduction,
    uint maxPremiumInAsset
  ) external payable onlyMember returns (uint) {

    require(msg.sender == ERC721.ownerOf(coverId), "Cover: not cover owner");

    CoverData storage currentCover = covers[coverId];
    require(currentCover.amount > amountReduction, "Cover: amountReduction > cover.amount");

    // clone the existing cover
    CoverData memory newCover = covers[coverId];

    // clone existing staking pools
    CoverChunk[] memory newCoverChunks = coverChunksForCover[coverId];

    uint newTotalCoverAmount = newCover.amount - amountReduction;

    uint newCoverId = covers.length;

    // reduce amount
    for (uint i = 0; i < newCoverChunks.length; i++) {
      IStakingPool stakingPool = IStakingPool(newCoverChunks[i].poolAddress);

      // reduce the amount per pool proportionately to the overall reduction
      uint newCoverAmount = newCoverChunks[i].coverAmountInNXM * newTotalCoverAmount / newCover.amount;
      stakingPool.reduceAmount(
        newCover.productId,
        newCover.period,
        newCover.start,
        REWARD_BPS * newCoverChunks[i].premiumInNXM / BASIS_PRECISION,
        newCoverAmount,
        REWARD_BPS * (newCoverChunks[i].premiumInNXM * newTotalCoverAmount / newCover.amount) / BASIS_PRECISION,
        newCoverChunks[i].coverAmountInNXM
      );

      // TODO: fix this. it should be proportional to the remaining period as well
      newCoverChunks[i].premiumInNXM =
      uint96(uint(newCoverChunks[i].premiumInNXM) * newTotalCoverAmount / newCover.amount);
      newCoverChunks[i].coverAmountInNXM = uint96(newCoverAmount);

      // write the new staking pool with modified parameters
      coverChunksForCover[newCoverId].push(newCoverChunks[i]);
    }

    newCover.start = uint32(block.timestamp);
    // new period is the remaining period
    newCover.period = currentCover.period - (uint32(block.timestamp) - currentCover.start);
    newCover.amount = uint96(newTotalCoverAmount);
    covers.push(newCover);
    // mint the new cover
    _safeMint(msg.sender, newCoverId);

    // the refund is proportional to the amount reduction and the period remaining
    uint refund = currentCover.amount
      * amountReduction / newCover.amount
      * uint96(newCover.period) / uint96(currentCover.period);

    // make the current cover expire at current block
    currentCover.period = uint32(block.timestamp) - currentCover.start;
    // adjust premium on current cover
    currentCover.premium = currentCover.premium - uint96(refund);

    uint premiumInAsset = _increasePeriod(newCoverId, extraPeriod);
    require(premiumInAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    if (premiumInAsset > refund) {
      // retrieve extra required payment
      retrievePayment(premiumInAsset- refund, newCover.payoutAsset);
    }

    // set the newly paid premium
    newCover.premium = uint96(premiumInAsset);

    return newCoverId;
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external onlyInternal override {
    CoverData memory cover = covers[coverId];
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
      pool.getCapacity(productId, capacityFactor)
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

  function setCapacityFactor(uint _capacityFactor) external onlyGovernance {
    capacityFactor = _capacityFactor;
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
