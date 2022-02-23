// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-v4/utils/Strings.sol";
import "../../interfaces/IStakingPool.sol";

contract StakingPool is IStakingPool, ERC20 {


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

  struct Product {
    uint96 activeCoverAmount;
    uint16 weight;
    uint16 lastBucket;
    // uint128 _unused;
  }

  struct ProductBucket {
    uint96 expiringCoverAmount;
    // uint160 _unused;
  }

  struct UnstakeRequest {
    uint96 amount;
    uint96 withdrawn;
    uint16 bucketIndex;
    // uint48 _unused;
  }

  struct Staker {
    uint96 unstakeAmount;
    uint16 lastUnstakeBucket;
    // FIFO:
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

  uint public poolId;

  /*
  (productId, poolAddress) => lastPrice
  Last base prices at which a cover was sold by a pool for a particular product.
  */
  mapping(uint => LastPrice) lastBasePrices;

  mapping(uint => uint) targetPrices;

  /* slot 0 */
  // bucket index => pool bucket
  mapping(uint => PoolBucket) public poolBuckets;

  /* slot 1 */
  // product index => bucket index => cover amount expiring
  mapping(uint => mapping(uint => ProductBucket)) public productBuckets;

  /* slot 2 */
  // staker address => staker unstake info
  // todo: unstakes may take a looooong time, consider issuing an nft that represents staker's requests
  mapping(address => Staker) public stakers;

  /* slot 3 */
  // staker address => request id => unstake request
  mapping(address => mapping(uint32 => UnstakeRequest)) unstakeRequests;

  /* slot 4 */
  // product id => product info
  mapping(uint => Product) public products;

  /* slot 5 */
  // array with product ids to be able to iterate them
  // todo: pack me
  uint[] public poolProductsIds;

  // unstakes flow:
  // 1. bucket n: unstake requested
  // 2. bucket n + 2: unstake becomes queued
  // 3. bucket n + 2 + m: unstake is granted

  /* slot 6 */
  uint96 public stakeActive;
  uint96 public stakeInactive;
  uint64 public lastRewardPerSecond;

  uint32 public lastRewardTime;
  uint16 public lastPoolBucketIndex;
  uint16 public lastUnstakeBucketIndex;
  uint16 public totalWeight;
  uint16 public maxTotalWeight; // todo: read from cover

  // IDK if the next three are needed:
  // total actually requested and not yet queued
  uint96 public totalUnstakeRequested;
  // requested at bucket t-2
  uint96 public totalUnstakeQueued;
  // unstaked but not withdrawn
  uint96 public totalUnstakeGranted;

  // used for max unstake
  // max unstake = min(stake - maxCapacity, stake - totalLeverage)
  uint96 public maxCapacity;
  uint96 public totalLeverage;

  address public override manager;

  /* immutables */
  ERC20 public immutable nxm;
  address public immutable coverContract;
  address public immutable memberRoles;

  /* constants */
  uint public constant TOKEN_PRECISION = 1e18;
  uint public constant PARAM_PRECISION = 10_000;
  uint public constant BUCKET_SIZE = 7 days;

  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_RATIO = 1e20;
  uint public constant PRICE_RATIO_CHANGE_PER_DAY = 100;
  uint public constant PRICE_DENOMINATOR = 10_000;
  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint public constant PRODUCT_WEIGHT_DENOMINATOR = 10_000;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 10_000;

  // base price bump by 2% for each 10% of capacity used
  uint public constant BASE_PRICE_BUMP_RATIO = 200; // 2%
  uint public constant BASE_PRICE_BUMP_INTERVAL = 1000; // 10%
  uint public constant BASE_PRICE_BUMP_DENOMINATOR = 10_000;

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  modifier onlyCoverContract {
    require(msg.sender == coverContract, "StakingPool: Caller is not the cover contract");
    _;
  }

  modifier onlyManager {
    require(msg.sender == manager, "StakingPool: Caller is not the manager");
    _;
  }

  constructor (uint _poolId, address _nxm, address _coverContract, address _memberRoles)
  ERC20("Nexus Mutual Staking Pool", "NMSPT") {
    nxm = ERC20(_nxm);
    coverContract = _coverContract;
    memberRoles = _memberRoles;
    poolId = _poolId;
  }

  function initialize(address _manager, uint _poolId) external override onlyCoverContract {
    require(lastPoolBucketIndex == 0, "Staking Pool: Already initialized");
    lastPoolBucketIndex = uint16(block.timestamp / BUCKET_SIZE);
    lastUnstakeBucketIndex = uint16(block.timestamp / BUCKET_SIZE);
    manager = _manager;
    poolId = _poolId;
  }

  /* View functions */

  function name() public view override returns (string memory) {
    return string(abi.encodePacked(super.name(), " ", Strings.toString(poolId)));
  }

  function min(uint a, uint b) internal pure returns (uint) {
    return a < b ? a : b;
  }

  function max(uint a, uint b) internal pure returns (uint) {
    return a > b ? a : b;
  }

  function getAvailableCapacity(
    uint productId,
    uint capacityFactor
  ) external override view returns (uint) {
    //
  }

  function getCapacity(uint productId, uint capacityFactor) external override view returns (uint) {}

  function getUsedCapacity(uint productId) external override view returns (uint) {}

  function getTargetPrice(uint productId) external override view returns (uint) {}

  function getStake(uint productId) external override view returns (uint) {}

  /* State-changing functions */

  function operatorTransferFrom(address from, address to, uint256 amount) external override {
    require(msg.sender == memberRoles, "StakingPool: Caller is not MemberRoles");
    _transfer(from, to, amount);
  }

  function processPoolBuckets() internal returns (uint staked) {

    // 1 SLOAD
    staked = stakeActive;
    uint rewardPerSecond = lastRewardPerSecond;
    uint rewardTime = lastRewardTime;
    uint poolBucketIndex = lastPoolBucketIndex;

    // 1 SLOAD
    uint unstakeQueued = totalUnstakeQueued;

    // get bucket for current time
    uint currentBucketIndex = block.timestamp / BUCKET_SIZE;

    // process expirations, 1 SLOAD / iteration
    while (poolBucketIndex < currentBucketIndex) {

      ++poolBucketIndex;
      uint bucketStartTime = poolBucketIndex * BUCKET_SIZE;
      staked += (bucketStartTime - rewardTime) * rewardPerSecond;
      rewardTime = bucketStartTime;

      // 1 SLOAD for both
      rewardPerSecond -= poolBuckets[poolBucketIndex].rewardPerSecondCut;
      unstakeQueued += poolBuckets[poolBucketIndex].unstakeRequested;
    }

    // if we're mid-bucket, process rewards until current timestamp
    staked += (block.timestamp - rewardTime) * rewardPerSecond;

    // 1 SSTORE
    stakeActive = uint96(staked);
    lastRewardPerSecond = uint64(rewardPerSecond);
    lastRewardTime = uint32(block.timestamp);
    lastPoolBucketIndex = uint16(poolBucketIndex);

    // 1 SSTORE
    totalUnstakeQueued = uint96(unstakeQueued);
  }

  /* callable by cover contract */

  function allocateCapacity(
    AllocateCapacityParams calldata params
  ) external override returns (uint, uint) {

    uint staked = processPoolBuckets();
    uint currentBucket = block.timestamp / BUCKET_SIZE;

    Product storage product = products[params.productId];
    uint activeCoverAmount = product.activeCoverAmount;
    uint lastBucket = product.lastBucket;

    // process expirations
    while (lastBucket < currentBucket) {
      ++lastBucket;
      activeCoverAmount -= productBuckets[params.productId][lastBucket].expiringCoverAmount;
    }

    // limit cover amount to the amount left available
    uint capacity = calculateCapacity(
      staked, product.weight, params.globalCapacityRatio,  params.capacityReductionRatio
    );

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
      lastRewardPerSecond = uint64(lastRewardPerSecond + addedRewardPerSecond);
      poolBuckets[expirationBucket].rewardPerSecondCut += uint64(addedRewardPerSecond);
      productBuckets[params.productId][expirationBucket].expiringCoverAmount += uint96(coverAmount);

      product.lastBucket = uint16(lastBucket);
      product.activeCoverAmount = uint96(activeCoverAmount + coverAmount);
    }

    // price calculation
    uint actualPrice = getActualPriceAndUpdateBasePrice(
      params.productId,
      coverAmount,
      product.activeCoverAmount,
      capacity,
      params.initialPrice
    );

    return (coverAmount, calculatePremium(actualPrice, coverAmount, params.period));
  }

  function freeCapacity(
    uint productId,
    uint previousPeriod,
    uint previousStartTime,
    uint previousRewardAmount,
    uint periodReduction,
    uint coveredAmount
  ) external override {

  }

  function burnStake() external {

    //

  }

  /* callable by stakers */

  function stake(uint amount) external {

    // TODO: use operator transfer and transfer to TC instead
    nxm.transferFrom(msg.sender, address(this), amount);

    uint supply = totalSupply();
    uint staked;
    uint shares;

    if (supply == 0) {
      shares = amount;
    } else {
      staked = processPoolBuckets();
      shares = supply * amount / staked;
    }

    stakeActive = uint96(staked + amount);
    _mint(msg.sender, shares);
  }

  function requestUnstake(uint shares) external {

    uint staked = processPoolBuckets();
    uint supply = totalSupply();
    uint amount = shares * staked / supply;
    uint currentBucket = block.timestamp / BUCKET_SIZE;

    // should revert if caller doesn't have enough shares
    _burn(msg.sender, shares);
    stakeActive = uint96(staked - amount);

    Staker memory staker = stakers[msg.sender];

    if (currentBucket != staker.lastUnstakeBucket) {
      ++staker.lastUnstakeId;
    }

    // SLOAD
    UnstakeRequest memory unstakeRequest = unstakeRequests[msg.sender][staker.lastUnstakeId];

    // update
    unstakeRequest.amount += uint96(amount);
    staker.unstakeAmount += uint96(amount);

    // SSTORE
    unstakeRequests[msg.sender][staker.lastUnstakeId] = unstakeRequest;
    stakers[msg.sender] = staker;
  }

  function withdraw(uint amount) external {

    // uint lastUnstakeBucket = lastUnstakeBucketIndex;

  }

  /* Pool management functions */

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
    require(targetPrice >= GLOBAL_MIN_PRICE_RATIO, "StakingPool: Target price must be greater than global min price");
    targetPrices[productId] = targetPrice;
  }

  /* VIEWS */

  /* ========== PRICE CALCULATION ========== */

  function calculatePremium(uint priceRatio, uint coverAmount, uint period) public pure returns (uint) {
    return priceRatio * coverAmount / MAX_PRICE_RATIO * period / 365 days;
  }

  uint public constant SURGE_THRESHOLD_RATIO = 8e17;
  uint public constant BASE_SURGE_LOADING_RATIO = 1e17;
  uint public constant SURGE_DENOMINATOR = 1e18;


  function getActualPriceAndUpdateBasePrice(
    uint productId,
    uint amount,
    uint activeCover,
    uint capacity,
    uint initialPrice
  ) internal returns (uint) {

    (uint actualPrice, uint basePrice) = getPrices(
      amount, activeCover, capacity, initialPrice, lastBasePrices[productId], targetPrices[productId], block.timestamp
    );
    // store the last base price
    lastBasePrices[productId] = LastPrice(
      uint96(basePrice),
      uint32(block.timestamp)
    );

    return actualPrice;
  }

  /**
   * @dev Calculates the actual price (price to be charged to the buyer)
   *      and the newly update base price - which moves towards the target price linearly with time
          and is subject to price bumps everytime a purchase is made
   * @param amount Amount of cover to be bought
   * @param activeCover Total amount of active cover
   * @param capacity Total capacity for the product
   * @param initialPrice Initial price set for the product
   * @param lastBasePrice Last recorded base price (during the last capacity allocation)
   * @param targetPrice Target price set by the pool manager
   * @param blockTimestamp Current block timestamp
  **/
  function getPrices(
    uint amount,
    uint activeCover,
    uint capacity,
    uint initialPrice,
    LastPrice memory lastBasePrice,
    uint targetPrice,
    uint blockTimestamp
  ) public pure returns (uint actualPrice, uint basePrice) {

    basePrice = interpolatePrice(
      lastBasePrice.value != 0 ? lastBasePrice.value : initialPrice,
      targetPrice,
      lastBasePrice.lastUpdateTime,
      blockTimestamp
    );

    // calculate actualPrice using the current basePrice
    actualPrice = calculatePrice(amount, basePrice, activeCover, capacity);

    // Bump base price by 2% (200 basis points) per 10% (1000 basis points) of capacity used
    uint priceBump = amount * BASE_PRICE_BUMP_DENOMINATOR / capacity / BASE_PRICE_BUMP_INTERVAL * BASE_PRICE_BUMP_RATIO;

    basePrice = uint96(basePrice + priceBump);
  }

  /**
    @dev calculates the actual price to be charged to the buyer using the time-interpolated base price.this
         Surge pricing applies for the cover amount that exceeds the SURGE_THRESHOLD_RATIO as a percentage of the total
         capacity.
    @param amount Amount of cover to be bought
    @param basePrice Time-interpolated base price set for the product
    @param activeCover Total amount of active cover
    @param capacity Total capacity for the product
  */
  function calculatePrice(
    uint amount,
    uint basePrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {

    uint activeCoverRatio = activeCover * 1e18 / capacity;
    uint newActiveCoverAmount = amount + activeCover;
    uint newActiveCoverRatio = newActiveCoverAmount * 1e18 / capacity;

    if (newActiveCoverRatio < SURGE_THRESHOLD_RATIO) {
      return basePrice;
    }

    uint surgeLoadingRatio = newActiveCoverRatio - SURGE_THRESHOLD_RATIO;

    // If the active cover ratio is already above SURGE_THRESHOLD (80%) then apply the surge loading to the entire
    // value of the cover (surgeFraction = 1). Otherwise apply to the part of the cover that is above the threshold.
    uint surgeFraction = activeCoverRatio >= SURGE_THRESHOLD_RATIO ? SURGE_DENOMINATOR : surgeLoadingRatio * capacity / amount;

    // Apply a base BASE_SURGE_LOADING_RATIO of 10% for each 1% of capacity used above SURGE_THRESHOLD_RATIO (80%)
    // to the value of the cover that is above the SURGE_THRESHOLD_RATIO (surgeLoadingRatio)
    // Divide the surge ratio by 2.
    uint surgeLoading =
      BASE_SURGE_LOADING_RATIO
      * surgeLoadingRatio / (SURGE_DENOMINATOR / 100)
      / 2 * surgeFraction / 1e18;

    /*
      Apply the surge loading to the base price
    */
    return basePrice * (1e18 + surgeLoading) / 1e18;
  }

  /**
   * Price changes towards targetPrice from lastPrice by maximum of 1% a day per every 100k NXM staked
   */
  function interpolatePrice(
    uint lastPrice,
    uint targetPrice,
    uint lastPriceUpdate,
    uint currentTimestamp
  ) public pure returns (uint) {

    uint priceChange = (currentTimestamp - lastPriceUpdate) / 1 days * PRICE_RATIO_CHANGE_PER_DAY;

    if (targetPrice > lastPrice) {
      return targetPrice;
    }

    return lastPrice - (lastPrice - targetPrice) * priceChange / PRICE_DENOMINATOR;
  }

  /**
  */
  function calculateCapacity(
    uint staked,
    uint productWeight,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) internal pure returns (uint) {
    return staked *
    globalCapacityRatio *
    productWeight *
    (CAPACITY_REDUCTION_DENOMINATOR - capacityReductionRatio) /
    GLOBAL_CAPACITY_DENOMINATOR /
    PRODUCT_WEIGHT_DENOMINATOR /
    CAPACITY_REDUCTION_DENOMINATOR;
  }

  function getPriceParameters(
    uint productId,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) external view returns (
    uint activeCover, uint capacity, uint lastBasePrice, uint targetPrice
  ) {

    Product storage product = products[productId];

    activeCover = product.activeCoverAmount;
    uint currentBucket = block.timestamp / BUCKET_SIZE;
    uint lastBucket = product.lastBucket;
    // process expirations
    while (lastBucket < currentBucket) {
      ++lastBucket;
      activeCover -= productBuckets[productId][lastBucket].expiringCoverAmount;
    }

    // TODO: FIXME: implement with new staking implementation
    uint staked = 0;
    capacity = calculateCapacity(
      staked,
      product.weight,
      globalCapacityRatio,
      capacityReductionRatio
    );
    lastBasePrice = lastBasePrices[productId].value;
    targetPrice = targetPrices[productId];
  }

}
