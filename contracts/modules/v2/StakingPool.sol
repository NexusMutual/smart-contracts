// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
// TODO: consider using solmate ERC721 implementation
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";

// total stake = active stake + expired stake
// product stake = active stake * product weight
// product stake = allocated product stake + free product stake
// on cover buys we allocate the free product stake and it becomes allocated.
// on expiration we deallocate the stake and it becomes free again

// ╭───────╼ Active stake ╾────────╮
// │                               │
// │     product weight            │
// │<────────────────────────>     │
// ├────╼ Product stake ╾────╮     │
// │                         │     │
// │ Allocated product stake │     │
// │   (used by covers)      │     │
// │                         │     │
// ├─────────────────────────┤     │
// │                         │     │
// │    Free product stake   │     │
// │                         │     │
// ╰─────────────────────────┴─────╯
//
// ╭───────╼ Expired stake ╾───────╮
// │                               │
// ╰───────────────────────────────╯

contract StakingPool is IStakingPool, ERC721 {
  using SafeCast for uint;

  /* storage */

  // currently active staked nxm amount
  uint public activeStake;

  // supply of pool stake shares used by groups
  uint public stakeSharesSupply;

  // supply of pool rewards shares used by groups
  uint public rewardsSharesSupply;

  // current nxm reward per second for the entire pool
  // applies to active stake only and does not need update on deposits
  uint public rewardPerSecond;

  // accumulated reward per share of pool
  uint public accRewardPerPoolShare;

  // last accRewardPerPoolShare update timestamp
  uint public lastRewardUpdate;

  uint public firstActiveGroupId;
  uint public lastActiveGroupId;

  uint public firstActiveBucketId;

  // erc721 supply
  uint public totalSupply;

  /*
    (productId, poolAddress) => lastPrice
    Last base prices at which a cover was sold by a pool for a particular product.
  */
  mapping(uint => LastPrice) lastBasePrices;

  mapping(uint => uint) targetPrices;

  // group id => amount
  mapping(uint => StakeGroup) public stakeGroups;

  // pool bucket id => PoolBucket
  mapping(uint => PoolBucket) public poolBuckets;

  // product id => pool bucket id => ProductBucket
  mapping(uint => mapping(uint => ProductBucket)) public productBuckets;

  // product id => Product
  mapping(uint => Product) public products;

  // nft id => group id => amount of group shares
  mapping(uint => mapping(uint => uint)) public balanceOf;

  address public manager;

  /* immutables */

  IERC20 public immutable nxm;
  address public immutable coverContract;

  /* constants */

  // 7 * 13 = 91
  uint constant BUCKET_SIZE = 7 days;
  uint constant GROUP_SIZE = 91 days;
  uint constant MAX_GROUPS = 9; // 8 whole quarters + 1 partial quarter

  uint constant REWARDS_MULTIPLIER = 125;
  uint constant REWARDS_DENOMINATOR = 100;
  uint constant WEIGHT_DENOMINATOR = 100;

  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint public constant PRODUCT_WEIGHT_DENOMINATOR = 10_000;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 10_000;
  uint public constant INITIAL_PRICE_DENOMINATOR = 10_000;

  // product params flags
  uint constant FLAG_PRODUCT_WEIGHT = 1;
  uint constant FLAG_PRODUCT_PRICE = 2;

  // withdraw flags
  uint constant FLAG_WITHDRAW_DEPOSIT = 1;
  uint constant FLAG_WITHDRAW_REWARDS = 2;

  modifier onlyCoverContract {
    // TODO: restrict calls to cover contract only
    _;
  }

  modifier onlyManager {
    require(msg.sender == manager, "StakingPool: Only pool manager can call this function");
    _;
  }

  constructor (
    string memory _name,
    string memory _symbol,
    IERC20 _token,
    address _coverContract
  ) ERC721(_name, _symbol) {
    nxm = _token;
    coverContract = _coverContract;
  }

  function initialize(
    address _manager,
    ProductInitializationParams[] calldata params
  ) external onlyCoverContract {
    manager = _manager;
    // TODO: initialize products
  }

  function operatorTransfer(
    address from,
    address to,
    uint256 tokenId
  ) external onlyCoverContract {
    _safeTransfer(from, to, tokenId, "");
  }

  function updateGroups() public {

    uint _firstActiveBucketId = firstActiveBucketId;
    uint currentBucketId = block.timestamp / BUCKET_SIZE;

    if (_firstActiveBucketId == currentBucketId) {
      return;
    }

    // SLOAD
    uint _activeStake = activeStake;
    uint _rewardPerSecond = rewardPerSecond;
    uint _accRewardPerShare = accRewardPerPoolShare;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _lastRewardUpdate = lastRewardUpdate;
    uint _firstActiveGroupId = firstActiveGroupId;

    // first group for the current timestamp
    uint targetGroupId = block.timestamp / GROUP_SIZE;

    while (_firstActiveBucketId < currentBucketId) {

      ++_firstActiveBucketId;
      uint bucketEndTime = _firstActiveBucketId * BUCKET_SIZE;
      uint elapsed = bucketEndTime - _lastRewardUpdate;

      _accRewardPerShare += elapsed * _rewardPerSecond / _rewardsSharesSupply;
      _lastRewardUpdate = bucketEndTime;
      _rewardPerSecond -= poolBuckets[_firstActiveBucketId].rewardPerSecondCut;

      // should we expire a group?
      if (
        bucketEndTime % GROUP_SIZE != 0 ||
        _firstActiveGroupId == targetGroupId
      ) {
        continue;
      }

      // SLOAD
      StakeGroup memory group = stakeGroups[_firstActiveGroupId];

      uint expiredStake = _activeStake * group.stakeShares / _stakeSharesSupply;
      _activeStake -= expiredStake;
      group.expiredStakeAmount = expiredStake;
      group.accRewardPerStakeShareAtExpiration = _accRewardPerShare;

      _stakeSharesSupply -= group.stakeShares;
      _rewardsSharesSupply -= group.rewardsShares;

      // SSTORE
      stakeGroups[_firstActiveGroupId] = group;

      // advance to the next group
      _firstActiveGroupId++;
    }

    firstActiveGroupId = _firstActiveGroupId;
    firstActiveBucketId = _firstActiveBucketId;

    activeStake = _activeStake;
    rewardPerSecond = _rewardPerSecond;
    accRewardPerPoolShare = _accRewardPerShare;
    stakeSharesSupply = _stakeSharesSupply;
    rewardsSharesSupply = _rewardsSharesSupply;
    lastRewardUpdate = _lastRewardUpdate;
  }

  function deposit(
    uint amount,
    uint groupId,
    uint _positionId
  ) external returns (uint positionId) {

    updateGroups();

    // require groupId not to be expired
    require(groupId >= firstActiveGroupId);

    if (_positionId == 0) {
      positionId = ++totalSupply;
      _mint(msg.sender, positionId);
    } else {
      positionId = _positionId;
    }

    // transfer nxm from staker
    nxm.transferFrom(msg.sender, address(this), amount);

    StakeGroup memory group = stakeGroups[groupId];

    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;

    uint newStakeShares = _stakeSharesSupply == 0
    ? amount
    : _stakeSharesSupply * amount / _activeStake;

    uint newRewardsShares = newStakeShares;

    {
      uint lockDuration = (groupId + 1) * GROUP_SIZE - block.timestamp;
      uint maxLockDuration = GROUP_SIZE * 8;
      newRewardsShares = newRewardsShares * REWARDS_MULTIPLIER / REWARDS_DENOMINATOR;
      newRewardsShares = newRewardsShares * lockDuration / maxLockDuration;
    }

    uint newGroupShares;

    if (group.groupSharesSupply == 0) {
      newGroupShares = amount;
    } else {
      // amount of nxm corresponding to this group
      uint groupStake = _activeStake * group.stakeShares / _stakeSharesSupply;
      newGroupShares = group.groupSharesSupply * amount / groupStake;
    }

    /* update rewards */

    uint _rewardPerSecond = rewardPerSecond;
    uint elapsed = block.timestamp - lastRewardUpdate;

    if (elapsed > 0) {
      lastRewardUpdate = block.timestamp;
      accRewardPerPoolShare += elapsed * _rewardPerSecond / _rewardsSharesSupply;
    }

    /* store */

    group.stakeShares += newStakeShares;
    group.rewardsShares += newRewardsShares;
    group.groupSharesSupply += newGroupShares;

    stakeGroups[groupId] = group;
    balanceOf[positionId][groupId] += newGroupShares;

    activeStake = _activeStake + amount;
    stakeSharesSupply = _stakeSharesSupply + newStakeShares;
    rewardsSharesSupply = _rewardsSharesSupply + newRewardsShares;
  }

  function withdraw(WithdrawParams[] memory params) external {
    // 1. check nft ownership / allowance
    // 2. loop through each group:
    // 2.1. check group expiration if the deposit flag is set
    // 2.2. calculate the reward amount if the reward flag is set
    // 3. sum up nxm amount of each group
    // 4. transfer nxm to staker
  }

  function allocateStake(
    uint productId,
    uint period,
    uint productStakeAmount,
    uint rewardRatio
  ) external onlyCoverContract returns (uint newAllocation, uint premium) {

    updateGroups();

    uint allocatedStake = products[productId].allocatedStake;
    uint currentBucket = block.timestamp / BUCKET_SIZE;

    {
      uint lastBucket = products[productId].lastBucket;

      // process expirations
      while (lastBucket < currentBucket) {
        ++lastBucket;
        allocatedStake -= productBuckets[productId][lastBucket].allocationCut;
      }
    }

    uint availableStake;
    {
      // group expiration must exceed the cover period
      uint _firstAvailableGroupId = (block.timestamp + period) / GROUP_SIZE;
      uint _firstActiveGroupId = block.timestamp / GROUP_SIZE;

      // start with the entire supply and subtract unavailable groups
      uint _stakeSharesSupply = stakeSharesSupply;
      uint availableShares = _stakeSharesSupply;

      for (uint i = _firstActiveGroupId; i < _firstAvailableGroupId; ++i) {
        availableShares -= stakeGroups[i].stakeShares;
      }

      // total stake available without applying product weight
      availableStake = activeStake * availableShares / _stakeSharesSupply;
      // total stake available for this product
      availableStake = availableStake * products[productId].weight / WEIGHT_DENOMINATOR;
    }

    // could happen if is 100% in-use or if product weight is changed
    if (allocatedStake >= availableStake) {
      // store expirations
      products[productId].allocatedStake = allocatedStake;
      products[productId].lastBucket = currentBucket;
      return (0, 0);
    }

    uint usableStake = availableStake - allocatedStake;
    newAllocation = min(productStakeAmount, usableStake);

    premium = calculatePremium(
      allocatedStake,
      usableStake,
      newAllocation,
      period
    );

    products[productId].allocatedStake = allocatedStake + newAllocation;
    products[productId].lastBucket = currentBucket;

    // divCeil = fn(a, b) => (a + b - 1) / b
    uint expireAtBucket = (block.timestamp + period + BUCKET_SIZE - 1) / BUCKET_SIZE;
    productBuckets[productId][expireAtBucket].allocationCut += newAllocation;

    // TODO: this is the other rewards denominator, we need a different name for the shares one
    uint reward = premium * rewardRatio / REWARDS_DENOMINATOR;
    reward;
    // TODO: calculate and update the reward per second
  }

  function calculatePremium(
    uint allocatedStake,
    uint usableStake,
    uint newAllocation,
    uint period
  ) public returns (uint) {
    allocatedStake;
    usableStake;
    newAllocation;
    period;
    return 0;
  }

  function deallocateStake(
    uint productId,
    uint start,
    uint period,
    uint amount,
    uint premium
  ) external onlyCoverContract {

  }

  // O(1)
  function burnStake(uint productId, uint start, uint period, uint amount) external onlyCoverContract {

    productId;
    start;
    period;

    // TODO: free up the stake used by the corresponding cover
    // TODO: check if it's worth restricting the burn to 99% of the active stake

    updateGroups();

    uint _activeStake = activeStake;
    activeStake = _activeStake > amount ? _activeStake - amount : 0;
  }

  /* pool management */

  function setProductDetails(ProductParams[] memory params) external onlyManager {

  }

  /* views */

  function getActiveStake() external view returns (uint) {
    return 0;
  }

  function getProductStake(
    uint productId, uint coverExpirationDate
  ) public view returns (uint) {
    return 0;
  }

  function getAllocatedProductStake(uint productId) public view returns (uint) {
    return 0;
  }

  function getFreeProductStake(
    uint productId, uint coverExpirationDate
  ) external view returns (uint) {
    return 0;
  }

  /* utils */

  function min(uint a, uint b) internal pure returns (uint) {
    return a < b ? a : b;
  }

  function max(uint a, uint b) internal pure returns (uint) {
    return a > b ? a : b;
  }

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
    uint capacityReductionRatio,
    uint period
  ) external view returns (
    uint activeCover, uint[] memory capacities, uint lastBasePrice, uint targetPrice
  ) {

    Product storage product = products[productId];

    activeCover = getAllocatedProductStake(productId);

    uint maxGroupSpanCount = ICover(coverContract).MAX_COVER_PERIOD() / GROUP_SIZE + 1;
    capacities = new uint[](maxGroupSpanCount);
    for (uint i = 0; i < maxGroupSpanCount; i++) {
      uint staked = getProductStake(productId, block.timestamp + i * GROUP_SIZE);

      capacities[i] = calculateCapacity(
        staked,
        product.weight,
        globalCapacityRatio,
        capacityReductionRatio
      );
    }
    lastBasePrice = lastBasePrices[productId].value;
    targetPrice = targetPrices[productId];
  }
}

