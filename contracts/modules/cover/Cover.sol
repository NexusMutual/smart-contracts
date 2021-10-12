
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IPool.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/ITokenController.sol";

contract Cover is ICover, MasterAwareV2 {

  uint public constant BUCKET_SIZE = 7 days;

  struct ProductBucket {
    uint96 coverAmountExpiring;
  }

  Product[] public override products;
  ProductType[] public override productTypes;

  mapping(uint => CoverData) public override covers;
  mapping(uint => CoverChunk[]) public coverChunksForCover;

  mapping(uint => uint) initialPrices;

  mapping(uint => uint96) public override activeCoverAmountInNXM;

  mapping(uint => mapping(uint => ProductBucket)) productBuckets;
  mapping(uint => uint) lastProductBucket;

  uint32 public capacityFactor;
  uint32 public coverCount;
  ICoverNFT public override coverNFT;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint public coverAssetsFallback;


  struct LastPrice {
    uint96 value;
    uint32 lastUpdateTime;
  }

  /*
    (productId, poolAddress) => lastPrice
    Last base prices at which a cover was sold by a pool for a particular product.
  */
  mapping(uint => mapping(address => LastPrice)) lastPrices;


  /* === CONSTANTS ==== */

  uint public REWARD_BPS = 5000;
  uint public constant PERCENTAGE_CHANGE_PER_DAY_BPS = 100;
  uint public constant BASIS_PRECISION = 10000;
  uint public constant STAKE_SPEED_UNIT = 100000e18;
  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;


  constructor() {
  }

  function initialize(ICoverNFT _coverNFT) public {
    require(address(coverNFT) == address(0), "Cover: already initialized");
    coverNFT = _coverNFT;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCover(
    BuyCoverParams memory params,
    CoverChunkRequest[] memory coverChunkRequests
  ) external payable override onlyMember returns (uint /*coverId*/) {

    require(initialPrices[params.productId] != 0, "Cover: product not initialized");
    require(
      assetIsSupported(products[params.productId].coverAssets, params.payoutAsset),
      "Cover: Payout asset is not supported"
    );
    require(
      assetIsSupported(products[params.productId].coverAssets, params.paymentAsset),
      "Cover: Payment asset is not supported"
    );

    // convert to NXM amount
    uint payoutAssetTokenPrice = pool().getTokenPrice(params.payoutAsset);

    updateActiveCoverAmountInNXM(params.productId, params.period, uint(params.amount) * 1e18 / payoutAssetTokenPrice);

    uint totalPremiumInNXM = 0;
    for (uint i = 0; i < coverChunkRequests.length; i++) {

      uint requestedCoverAmountInNXM = coverChunkRequests[i].coverAmountInAsset * 1e18 / payoutAssetTokenPrice;

      // TODO: receive update on expired cover to update activeCoverInNXM
      (uint coveredAmountInNXM, uint premiumInNXM) = buyCoverFromPool(
        IStakingPool(coverChunkRequests[i].poolAddress),
        params.productId,
        requestedCoverAmountInNXM,
        params.period
      );

      // carry over the amount that was not covered by the current pool to the next cover
      if (coveredAmountInNXM < requestedCoverAmountInNXM && i + 1 < coverChunkRequests.length) {
        coverChunkRequests[i + 1].coverAmountInAsset +=
          (requestedCoverAmountInNXM - uint96(coveredAmountInNXM)) * payoutAssetTokenPrice / 1e18;
      } else if (coveredAmountInNXM < requestedCoverAmountInNXM) {
        revert("Not enough available capacity");
      }

      totalPremiumInNXM += premiumInNXM;

      coverChunksForCover[coverCount].push(
        CoverChunk(coverChunkRequests[i].poolAddress, uint96(coveredAmountInNXM), uint96(premiumInNXM))
      );
    }

    uint premiumInPaymentAsset = totalPremiumInNXM * pool().getTokenPrice(params.paymentAsset) / 1e18;

    uint coverId = coverCount++;
    covers[coverId] = CoverData(
        params.productId,
        params.payoutAsset,
        uint96(params.amount),
        uint32(block.timestamp + 1),
        uint32(params.period),
        uint96(premiumInPaymentAsset)
      );

    coverNFT.safeMint(params.owner, coverId);

    require(premiumInPaymentAsset <= params.maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");
    retrievePayment(premiumInPaymentAsset, params.payoutAsset);

    tokenController().mint(params.owner, totalPremiumInNXM / 10);

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
    lastPrices[productId][address(stakingPool)] = LastPrice(uint96(basePrice), uint32(block.timestamp));

    stakingPool.buyCover(
      productId,
      coveredAmount,
      REWARD_BPS * premiumInNXM / BASIS_PRECISION,
      period,
      capacityFactor
    );

    return (coveredAmount, premiumInNXM);
  }

  function increaseAmount(
    uint coverId,
    uint96 amount,
    uint maxPremiumInAsset,
    CoverChunkRequest[] calldata coverChunkRequests
  ) external payable onlyMember returns (uint) {

    CoverData memory cover = covers[coverId];
    require(cover.start + cover.period > block.timestamp, "Cover: cover expired");

    // TODO: add check for max 20% MCR check for activeCoverAmountInNXM

    (uint coverId, uint premiumInAsset) = _increaseAmount(coverId, amount, coverChunkRequests);

    require(premiumInAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");
    retrievePayment(premiumInAsset, covers[coverId].payoutAsset);
    return coverId;
  }

  function _increaseAmount(
    uint coverId,
    uint96 amount,
    CoverChunkRequest[] memory coverChunkRequests
  ) internal returns (uint newCoverId, uint premiumInAsset) {

    CoverData storage originalCover = covers[coverId];

    CoverChunk[] memory originalCoverChunks = coverChunksForCover[coverId];

    newCoverId = coverCount++;

    uint tokenPrice = pool().getTokenPrice(originalCover.payoutAsset);

    uint32 remainingPeriod = originalCover.start + originalCover.period - uint32(block.timestamp);
    uint totalPremiumInNXM = 0;

    {
      // convert to NXM amount
      uint amountLeftToCoverInNXM = uint(amount) * 1e18 / tokenPrice;

      for (uint i = 0; i < coverChunkRequests.length; i++) {
        if (amountLeftToCoverInNXM == 0) {
          break;
        }

        uint coveredAmountInNXM;
        uint premiumInNXM;
        {
          uint requestedCoverAmountInNXM = coverChunkRequests[i].coverAmountInAsset * 1e18 / tokenPrice;

          // TODO: receive update on expired cover to update activeCoverInNXM
          (coveredAmountInNXM, premiumInNXM) = buyCoverFromPool(
            IStakingPool(coverChunkRequests[i].poolAddress),
            originalCover.productId,
            requestedCoverAmountInNXM,
            remainingPeriod
          );

          // carry over the amount that was not covered by the current pool to the next cover
          if (coveredAmountInNXM < requestedCoverAmountInNXM && i + 1 < coverChunkRequests.length) {
            coverChunkRequests[i + 1].coverAmountInAsset +=
            (requestedCoverAmountInNXM - uint96(coveredAmountInNXM)) * tokenPrice / 1e18;
          }
        }

        amountLeftToCoverInNXM -= coveredAmountInNXM;
        totalPremiumInNXM += premiumInNXM;

        {

          for (uint j = 0; j < originalCoverChunks.length; j++) {
            if (originalCoverChunks[j].poolAddress == coverChunkRequests[i].poolAddress) {
              // if the pool already exists add the previously existing amounts
              coveredAmountInNXM = coveredAmountInNXM + originalCoverChunks[j].coverAmountInNXM;
              // set the premium as the premium remainder for the rest of the period + the newly paid premium
              premiumInNXM = premiumInNXM + originalCoverChunks[j].premiumInNXM * remainingPeriod / originalCover.period;
              break;
            }
          }
          coverChunksForCover[newCoverId].push(
            CoverChunk(
              coverChunkRequests[i].poolAddress,
              uint96(coveredAmountInNXM),
              uint96(premiumInNXM)
            ));
        }
      }
      require(amountLeftToCoverInNXM == 0, "Not enough available capacity");
    }

    premiumInAsset = totalPremiumInNXM * tokenPrice / 1e18;

    // make the previous cover expire at current block
    uint32 elapsedPeriod = originalCover.period - remainingPeriod;
    uint96 updatedOriginalPremium = originalCover.premium * elapsedPeriod / originalCover.period;
    uint96 carriedPremium = originalCover.premium - updatedOriginalPremium;

    originalCover.period = elapsedPeriod;
    covers[coverId].premium = updatedOriginalPremium;

    covers[coverId] = CoverData(
        originalCover.productId,
        originalCover.payoutAsset,
        originalCover.amount + amount,
        uint32(block.timestamp), // start
        remainingPeriod,
        uint96(premiumInAsset + carriedPremium)
      );

    // mint the new cover
    coverNFT.safeMint(msg.sender, newCoverId);
  }

  function increasePeriod(uint coverId, uint32 extraPeriod, uint maxPremiumInAsset) external payable onlyMember {


    CoverData memory cover = covers[coverId];
    require(cover.start + cover.period > block.timestamp, "Cover: cover expired");

    uint premiumInAsset = _increasePeriod(coverId, extraPeriod);
    require(premiumInAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    retrievePayment(premiumInAsset, covers[coverId].payoutAsset);
  }

  function _increasePeriod(uint coverId, uint32 extraPeriod) internal returns (uint) {

    CoverData storage cover = covers[coverId];
    CoverChunk[] storage coverChunks = coverChunksForCover[coverId];

    uint extraPremiumInNXM = 0;
    for (uint i = 0; i < coverChunks.length; i++) {
      IStakingPool stakingPool = IStakingPool(coverChunks[i].poolAddress);

      (uint basePrice, uint premiumInNXM) = getPrice(
        coverChunks[i].coverAmountInNXM, extraPeriod,
        cover.productId,
        stakingPool
      );

      lastPrices[cover.productId][address(stakingPool)] = LastPrice(uint96(basePrice), uint32(block.timestamp));

      // TODO: receive update on expired cover to update activeCoverInNXM
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

    uint premiumInAsset = extraPremiumInNXM * pool().getTokenPrice(cover.payoutAsset) / 1e18;

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

    CoverData storage cover = covers[coverId];
    require(cover.start + cover.period > block.timestamp, "Cover: cover expired");

    require(
      cover.period - (block.timestamp - cover.start) > periodReduction,
      "Cover: periodReduction > remaining period"
    );

    // TODO: add check for max 20% MCR check for activeCoverAmountInNXM

    CoverChunk[] storage originalCoverChunks = coverChunksForCover[coverId];

    // reduce period
    for (uint i = 0; i < originalCoverChunks.length; i++) {
      IStakingPool stakingPool = IStakingPool(originalCoverChunks[i].poolAddress);

      // TODO: receive update on expired cover to update activeCoverInNXM
      stakingPool.reducePeriod(
        cover.productId,
        cover.period,
        cover.start,
        REWARD_BPS * originalCoverChunks[i].premiumInNXM / BASIS_PRECISION,
        periodReduction,
        originalCoverChunks[i].coverAmountInNXM
      );

      originalCoverChunks[i].premiumInNXM =
        originalCoverChunks[i].premiumInNXM * (cover.period - periodReduction) / cover.period;
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

    CoverData storage currentCover = covers[coverId];
    require(currentCover.amount > amountReduction, "Cover: amountReduction > cover.amount");
    require(currentCover.start + currentCover.period > block.timestamp, "Cover: cover expired");

    // clone the existing cover
    CoverData memory newCover = covers[coverId];

    // clone existing cover chunks
    CoverChunk[] memory newCoverChunks = coverChunksForCover[coverId];

    uint newTotalCoverAmount = newCover.amount - amountReduction;

    uint newCoverId = coverCount++;

    // reduce amount
    for (uint i = 0; i < newCoverChunks.length; i++) {
      IStakingPool stakingPool = IStakingPool(newCoverChunks[i].poolAddress);

      // reduce the amount per pool proportionately to the overall reduction
      uint newCoverAmount = newCoverChunks[i].coverAmountInNXM * newTotalCoverAmount / newCover.amount;

      // TODO: receive update on expired cover to update activeCoverInNXM
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
    covers[newCoverId] = newCover;
    // mint the new cover
    coverNFT.safeMint(msg.sender, newCoverId);

    // the refund is proportional to the amount reduction and the period remaining
    uint96 refund = uint96(uint(currentCover.premium)
      * uint(amountReduction) / uint(newCover.amount)
      * uint(newCover.period) / uint(currentCover.period));

    // make the current cover expire at current block
    currentCover.period = uint32(block.timestamp) - currentCover.start;
    // adjust premium on current cover

    currentCover.premium = currentCover.premium - uint96(refund);

    uint premiumInAsset = _increasePeriod(newCoverId, extraPeriod);
    require(premiumInAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    if (premiumInAsset > refund) {
      // retrieve extra required payment
      retrievePayment(premiumInAsset - refund, newCover.payoutAsset);
    }

    // set the newly paid premium
    newCover.premium = uint96(premiumInAsset);

    return newCoverId;
  }

  function updateActiveCoverAmountInNXM(uint productId, uint period, uint amountToCoverInNXM) internal {
    uint currentBucket = block.timestamp / BUCKET_SIZE;

    uint activeCoverAmount = activeCoverAmountInNXM[productId];
    uint lastBucket = lastProductBucket[productId];
    while (lastBucket < currentBucket) {
      ++lastBucket;
      activeCoverAmount -= productBuckets[productId][lastBucket].coverAmountExpiring;
    }

    activeCoverAmountInNXM[productId] = uint96(activeCoverAmount + amountToCoverInNXM);
    require(activeCoverAmountInNXM[productId] < mcr().getMCR() / 5, "Cover: Total cover amount exceeds 20% of MCR");

    lastProductBucket[productId] = lastBucket;

    productBuckets[productId][(block.timestamp + period) / BUCKET_SIZE].coverAmountExpiring = uint96(amountToCoverInNXM);
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external onlyInternal override {
    CoverData memory cover = covers[coverId];
    CoverData memory newCover = CoverData(
      cover.productId,
      cover.payoutAsset,
      uint96(cover.amount - amount),
      uint32(block.timestamp + 1),
      cover.start + cover.period - uint32(block.timestamp),
      cover.premium
    );

    covers[coverCount++] = newCover;

    coverNFT.burn(coverId);
    coverNFT.safeMint(owner, coverCount - 1);
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

    uint96 lastPrice = lastPrices[productId][address(pool)].value;
    uint basePrice = interpolatePrice(
      lastPrice != 0 ? lastPrice : initialPrices[productId],
      pool.getTargetPrice(productId),
      lastPrices[productId][address(pool)].lastUpdateTime,
      block.timestamp
    );

    uint pricePercentage = calculatePrice(
      amount,
      basePrice,
      pool.getUsedCapacity(productId),
      pool.getCapacity(productId, capacityFactor)
    );

    uint price = pricePercentage * amount / MAX_PRICE_PERCENTAGE * period / 365 days;

    return (basePrice, price);
  }

  /**
    Price changes towards targetPrice from lastPrice by maximum of 1% a day per every 100k NXM staked
  */
  function interpolatePrice(
    uint lastPrice,
    uint targetPrice,
    uint lastPriceUpdate,
    uint now
  ) public pure returns (uint) {

    uint percentageChange =
      (now - lastPriceUpdate) / 1 days * PERCENTAGE_CHANGE_PER_DAY_BPS;

    if (targetPrice > lastPrice) {
      return targetPrice;
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

  function setCapacityFactor(uint32 _capacityFactor) external onlyGovernance {
    capacityFactor = _capacityFactor;
  }

  function setInitialPrice(uint productId, uint initialPrice) external onlyAdvisoryBoard {
    initialPrices[productId] = initialPrice;
  }

  function addProduct(Product calldata product) external onlyAdvisoryBoard {

    products.push(product);
    lastProductBucket[products.length - 1] = block.timestamp / BUCKET_SIZE;
  }

  function setCoverAssetsFallback(uint _coverAssetsFallback) external onlyGovernance {
    coverAssetsFallback = _coverAssetsFallback;
  }

  /* ========== HELPERS ========== */

  function assetIsSupported(uint payoutAssetsBitMap, uint8 payoutAsset) public returns (bool) {

    if (payoutAssetsBitMap == 0) {
      return 1 << payoutAsset & coverAssetsFallback > 0;
    }
    return 1 << payoutAsset & payoutAssetsBitMap > 0;
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function mcr() internal view returns (IMCR) {
    return IMCR(internalContracts[uint(ID.MC)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function changeDependentContractAddress() external override {
    master = INXMMaster(master);
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.MC)] = master.getLatestAddress("MC");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
  }
}
