// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/ERC20.sol";

contract StakingPool is ERC20 {

  struct PoolBucket {
    // slot 0
    uint64 rewardPerSecondCut;
    // amount of shares requested for unstake
    uint96 unstakeRequested;
    // amount of unstaked shares
    uint96 unstaked;

    // slot 1
    // underlying amount unstaked, stored for rate calculation
    uint96 unstakedNXM;
  }

  struct ProductBucket {
    uint96 coverAmountExpiring;
    // expiring capacity for the last 5 buckets
    // but only if this is the checkpoint bucket
    uint96 checkpointCapacityExpiring;
    // uint64 _unused;
  }

  struct Product {
    uint96 activeCoverAmount;
    uint16 weight;
    uint16 lastBucket;
    // uint128 _unused;
    mapping(uint => ProductBucket) buckets;
  }

  struct UnstakeRequest {
    uint96 amount;
    uint96 withdrawn;
    uint16 poolBucketIndex;
    // uint48 _unused;
  }

  struct AllocateCapacityParams {
    uint productId;
    uint coverAmount;
    uint rewardsDenominator;
    uint period;
    uint globalCapacityRatio;
    uint globalRewardsRatio;
    uint capacityReductionRatio;
    uint initialPrice;
  }

  struct Staker {
    uint96 pendingUnstakeAmount;
    // unstakeRequests mapping keys. zero means no unstake exists.
    uint32 firstUnstakeId;
    uint32 lastUnstakeId;
    uint16 lastUnstakeBucketIndex;
    // uint48 _unused;
  }

  struct LastPrice {
    uint96 value;
    uint32 lastUpdateTime;
  }

  /*
  (productId, poolAddress) => lastPrice
  Last base prices at which a cover was sold by a pool for a particular product.
  */
  mapping(uint => LastPrice) lastBasePrices;

  mapping (uint => uint) targetPrices;

  /* slot 0 */
  // bucket index => pool bucket
  mapping(uint => PoolBucket) public poolBuckets;

  /* slot 1 */
  // staker address => staker unstake info
  // todo: unstakes may take a looooong time, consider issuing an nft that represents staker's requests
  mapping(address => Staker) public stakers;

  /* slot 2 */
  mapping(address => mapping(uint32 => UnstakeRequest)) unstakeRequests;

  /* slot 3 */
  // product id => product info
  mapping(uint => Product) public products;

  /* slot 4 */
  // array with product ids to be able to iterate them
  // todo: pack me
  uint[] public poolProductsIds;

  /* slot 5 */
  uint96 public currentStake;
  uint64 public currentRewardPerSecond;
  uint32 public lastRewardTime;
  uint16 public lastPoolBucketIndex;
  uint16 public lastUnstakeBucketIndex;
  uint16 public totalWeight;
  uint16 public maxTotalWeight; // todo: read from cover

  /* slot 6 */
  // total actually requested and not yet processed
  uint96 public totalUnstakePending;
  // requested at bucket t-2
  uint96 public totalUnstakeAllowed;
  // unstaked but not withdrawn
  uint96 public totalUnstaked;

  // used for max unstake
  // max unstake = min(stake - maxCapacity, stake - totalLeverage)
  uint96 public maxCapacity;
  uint96 public totalLeverage;

  address public manager;

  /* immutables */
  ERC20 public immutable nxm;
  address public immutable coverContract;

  /* constants */
  uint public constant TOKEN_PRECISION = 1e18;
  uint public constant PARAM_PRECISION = 10_000;
  uint public constant BUCKET_SIZE = 7 days;

  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;
  uint public constant PRICE_RATIO_CHANGE_PER_DAY = 100;
  uint public constant PRICE_DENOMINATOR = 10_000;
  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint public constant PRODUCT_WEIGHT_DENOMINATOR = 10_000;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 10_000;

  uint public constant GLOBAL_MIN_PRICE = 100; // 1%

  modifier onlyCoverContract {
    require(msg.sender == coverContract, "StakingPool: Caller is not the cover contract");
    _;
  }

  modifier onlyManager {
    require(msg.sender == manager, "StakingPool: Caller is not the manager");
    _;
  }

  constructor (address _nxm, address _coverContract, address _owner) ERC20("Staked NXM", "SNXM") {
    nxm = ERC20(_nxm);
    coverContract = _coverContract;
    manager = _owner;
  }

  function initialize() external onlyCoverContract {
    require(lastPoolBucketIndex == 0, "Staking Pool: Already initialized");
    lastPoolBucketIndex = uint16(block.timestamp / BUCKET_SIZE);
    lastUnstakeBucketIndex = uint16(block.timestamp / BUCKET_SIZE);
  }

  /* View functions */

  function min(uint a, uint b) internal pure returns (uint) {
    return a < b ? a : b;
  }

  function max(uint a, uint b) internal pure returns (uint) {
    return a > b ? a : b;
  }

  /* State-changing functions */

  function processPoolBuckets() internal returns (uint staked) {

    // 1 SLOAD
    staked = currentStake;
    uint rewardPerSecond = currentRewardPerSecond;
    uint rewardTime = lastRewardTime;
    uint poolBucketIndex = lastPoolBucketIndex;
    uint unstakeBucketIndex = lastUnstakeBucketIndex;

    // 1 SLOAD
    uint _totalUnstakeAllowed = totalUnstakeAllowed;
    // TODO: do we need this one?
    uint _totalUnstaked = totalUnstaked;

    // 1 SLOAD
    uint supply = totalSupply();

    // get bucket for current time
    uint currentBucketIndex = block.timestamp / BUCKET_SIZE;
    uint maxUnstake;

    {
      // 1 SLOAD
      uint maxUsage = max(maxCapacity, totalLeverage);
      maxUnstake = staked > maxUsage ? staked - maxUsage : 0;
    }

    // process expirations
    while (poolBucketIndex < currentBucketIndex) {

      ++poolBucketIndex;
      uint bucketStartTime = poolBucketIndex * BUCKET_SIZE;
      staked += (bucketStartTime - rewardTime) * rewardPerSecond;
      rewardTime = bucketStartTime;

      // 1 SLOAD for both
      rewardPerSecond -= poolBuckets[poolBucketIndex].rewardPerSecondCut;
      _totalUnstakeAllowed += poolBuckets[poolBucketIndex].unstakeRequested;

      // process unstakes
      while (maxUnstake > 0 && _totalUnstakeAllowed > 0 && unstakeBucketIndex <= poolBucketIndex) {

        // 1 SLOAD
        uint requested = poolBuckets[unstakeBucketIndex].unstakeRequested;
        uint unstakedPreviously = poolBuckets[unstakeBucketIndex].unstaked;

        if (requested == unstakedPreviously) {
          // all freed up or none requested
          ++unstakeBucketIndex;
          continue;
        }

        uint unstakedNow;
        {
          uint unstakeLeft = requested - unstakedPreviously;
          uint canUnstake = min(maxUnstake, _totalUnstakeAllowed);
          unstakedNow = min(canUnstake, unstakeLeft);
        }

        uint unstakedNXM = unstakedNow * staked / supply;
        _totalUnstakeAllowed -= unstakedNow;
        maxUnstake -= unstakedNow;
        staked -= unstakedNXM;
        supply -= unstakedNow;

        // 1 SSTORE
        poolBuckets[unstakeBucketIndex].unstaked = uint96(unstakedPreviously + unstakedNow);
        // 1 SLOAD + 1 SSTORE
        poolBuckets[unstakeBucketIndex].unstakedNXM += uint96(unstakedNXM);

        if (requested != unstakedPreviously + unstakedNow) {
          break;
        }

        // move on
        ++unstakeBucketIndex;
      }
    }

    {
      uint oldSupply = totalSupply();
      uint burnAmount = oldSupply - supply;
      // todo: burn unstaked lp tokens
    }

    // if we're mid-bucket, process rewards until current timestamp
    staked += (block.timestamp - rewardTime) * rewardPerSecond;

    // 1 SSTORE
    currentStake = uint96(staked);
    currentRewardPerSecond = uint64(rewardPerSecond);
    lastRewardTime = uint32(block.timestamp);
    lastPoolBucketIndex = uint16(poolBucketIndex);
    lastUnstakeBucketIndex = uint16(unstakeBucketIndex);

    // 1 SSTORE
    totalUnstakeAllowed = uint96(_totalUnstakeAllowed);
    totalUnstaked = uint96(_totalUnstaked);
  }

  /* callable by cover contract */

  function allocateCapacity(AllocateCapacityParams calldata params) external returns (uint, uint) {

    uint staked = processPoolBuckets();
    uint currentBucket = block.timestamp / BUCKET_SIZE;

    Product storage product = products[params.productId];
    uint activeCoverAmount = product.activeCoverAmount;
    uint lastBucket = product.lastBucket;

    // process expirations
    while (lastBucket < currentBucket) {
      ++lastBucket;
      activeCoverAmount -= product.buckets[lastBucket].coverAmountExpiring;
    }

    // limit cover amount to the amount left available

    uint capacity =
      staked * params.globalCapacityRatio * product.weight * (CAPACITY_REDUCTION_DENOMINATOR - params.capacityReductionRatio)
      / GLOBAL_CAPACITY_DENOMINATOR / PRODUCT_WEIGHT_DENOMINATOR / CAPACITY_REDUCTION_DENOMINATOR;
    uint coverAmount = min(
      capacity - activeCoverAmount,
      params.coverAmount
    );

    {
      // calculate expiration bucket, reward period, reward amount
      uint expirationBucket = (block.timestamp + params.period) / BUCKET_SIZE + 1;
      uint rewardPeriod = expirationBucket * BUCKET_SIZE - block.timestamp;
      uint addedRewardPerSecond = params.globalRewardsRatio * coverAmount / params.rewardsDenominator / rewardPeriod;

      // update state
      // 1 SLOAD + 3 SSTORE
      currentRewardPerSecond = uint64(currentRewardPerSecond + addedRewardPerSecond);
      poolBuckets[expirationBucket].rewardPerSecondCut += uint64(addedRewardPerSecond);
      product.buckets[expirationBucket].coverAmountExpiring += uint96(coverAmount);

      product.lastBucket = uint16(lastBucket);
      product.activeCoverAmount = uint96(activeCoverAmount + coverAmount);
    }

    // price calculation
    uint actualPrice = getActualPriceAndUpdateBasePrice(
      params.productId,
      coverAmount,
      product.activeCoverAmount,
      activeCoverAmount,
      params.initialPrice
    );

    return (coverAmount, calculatePremium(actualPrice, coverAmount, params.period));
  }

  function burn() external {

    //

  }

  /* callable by stakers */

  function deposit(uint amount) external {

    uint staked = processPoolBuckets();
    uint supply = totalSupply();
    uint mintAmount = supply == 0 ? amount : (amount * supply / staked);

    // TODO: use operator transfer and transfer to TC
    nxm.transferFrom(msg.sender, address(this), amount);
    _mint(msg.sender, mintAmount);
  }

  function requestUnstake(uint96 amount) external {

    Staker memory staker = stakers[msg.sender];
    uint16 unstakeBucketIndex = uint16(block.timestamp / BUCKET_SIZE + 2);

    // update staker if we're not reusing the unstake request
    if (staker.lastUnstakeBucketIndex != unstakeBucketIndex) {

      staker.lastUnstakeId += 1;
      staker.lastUnstakeBucketIndex = unstakeBucketIndex;
      staker.pendingUnstakeAmount += amount;

      if (staker.firstUnstakeId == 0) {
        staker.firstUnstakeId = staker.lastUnstakeId;
      }

      // update staker info
      stakers[msg.sender] = staker;
    }

    // upsert unstake request
    UnstakeRequest storage unstakeRequest = unstakeRequests[msg.sender][staker.lastUnstakeId];
    unstakeRequest.amount += amount;
    unstakeRequest.poolBucketIndex = unstakeBucketIndex;

    // update pool bucket
    poolBuckets[unstakeBucketIndex].unstakeRequested += amount;

    _transfer(msg.sender, address(this), amount);
  }

  function withdraw() external {

    // uint lastUnstakeBucket = lastUnstakeBucketIndex;

  }

  /* callable by pool owner */

  function addProduct() external onlyManager {

    //

  }

  function removeProduct() external onlyManager {

    //

  }

  function setWeights() external onlyManager {

    //

  }

  function setTargetPrice(uint productId, uint targetPrice) external onlyManager {
    require(targetPrice >= GLOBAL_MIN_PRICE, "StakingPool: Target price must be greater than global min price");
    targetPrices[productId] = targetPrice;
  }

  /* VIEWS */

  /* ========== PRICE CALCULATION ========== */

  function calculatePremium(uint pricePercentage, uint coverAmount, uint period) public pure returns (uint) {
    return pricePercentage * coverAmount / MAX_PRICE_PERCENTAGE * period / 365 days;
  }

  uint public constant SURGE_THRESHOLD = 8e17;
  uint public constant BASE_SURGE_LOADING = 1e16;


  function getActualPriceAndUpdateBasePrice(
    uint productId,
    uint amount,
    uint activeCover,
    uint capacity,
    uint initialPrice
  ) internal returns (uint) {


    (uint actualPrice, uint basePrice) = getPrices(productId, amount, activeCover, capacity, initialPrice);
    // store the last base price
    lastBasePrices[productId] = LastPrice(
      uint96(basePrice),
      uint32(block.timestamp
    ));

    return actualPrice;
  }

  function getPrices(
    uint productId,
    uint amount,
    uint activeCover,
    uint capacity,
    uint initialPrice
  ) public view returns  (uint actualPrice, uint basePrice) {

    LastPrice memory lastBasePrice = lastBasePrices[productId];
    uint96 lastPrice = lastBasePrices[productId].value;
    basePrice = interpolatePrice(
      lastBasePrice.value != 0 ? lastBasePrice.value : initialPrice,
      targetPrices[productId],
      lastBasePrices[productId].lastUpdateTime,
      block.timestamp
    );

    // calculate actualPrice using the current basePrice
    actualPrice = calculatePrice(amount, basePrice, activeCover, capacity);

    // Bump base price by 2% (200 basis points) per 10% (1000 basis points) of capacity used
    uint priceBump = amount * PRICE_DENOMINATOR / capacity / 1000 *  200;
    basePrice = uint96(basePrice + priceBump);
  }

  function calculatePrice(
    uint amount,
    uint basePrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {

    uint newActiveCoverAmount = amount + activeCover;
    uint newActiveCoverRatio = newActiveCoverAmount * 1e18 / capacity;

    if (newActiveCoverRatio > SURGE_THRESHOLD) {
      return basePrice;
    }

    uint surgeLoadingRatio = newActiveCoverRatio - SURGE_THRESHOLD;
    uint surgeFraction = surgeLoadingRatio * capacity / newActiveCoverAmount;
    uint surgeLoading = BASE_SURGE_LOADING * surgeLoadingRatio / 1e18 / 2 * surgeFraction / 1e18;

    return basePrice * (1e18 + surgeLoading) / 1e18;
  }


  /**
    Price changes towards targetPrice from lastPrice by maximum of 1% a day per every 100k NXM staked
  */
  function interpolatePrice(
    uint lastPrice,
    uint targetPrice,
    uint lastPriceUpdate,
    uint currentTimestamp
  ) public pure returns (uint) {

    uint percentageChange =
    (currentTimestamp - lastPriceUpdate) / 1 days * PRICE_RATIO_CHANGE_PER_DAY;

    if (targetPrice > lastPrice) {
      return targetPrice;
    } else {
      return lastPrice - (lastPrice - targetPrice) * percentageChange / PRICE_DENOMINATOR;
    }
  }
}
