// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
// TODO: consider using solmate ERC721 implementation
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";
import "../../interfaces/IStakingPool.sol";

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
    params;
  }

  function operatorTransfer(
    address from,
    address to,
    uint[] calldata tokenIds
  ) external onlyCoverContract {
    uint length = tokenIds.length;
    for (uint i = 0; i < length; ++i) {
      _safeTransfer(from, to, tokenIds[i], "");
    }
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

    uint newRewardsShares;
    {
      uint lockDuration = (groupId + 1) * GROUP_SIZE - block.timestamp;
      uint maxLockDuration = GROUP_SIZE * 8;
      newRewardsShares =
        newStakeShares * REWARDS_MULTIPLIER * lockDuration / REWARDS_DENOMINATOR / maxLockDuration;
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
    uint gracePeriod,
    uint productStakeAmount,
    uint rewardRatio
  ) external onlyCoverContract returns (uint newAllocation, uint premium) {

    updateGroups();

    Product memory product = products[productId];
    uint allocatedProductStake = product.allocatedStake;
    uint currentBucket = block.timestamp / BUCKET_SIZE;

    {
      uint lastBucket = product.lastBucket;

      // process expirations
      while (lastBucket < currentBucket) {
        ++lastBucket;
        allocatedProductStake -= productBuckets[productId][lastBucket].allocationCut;
      }
    }

    uint freeProductStake;
    {
      // TODO: account for grace period
      // group expiration must exceed the cover period
      uint _firstAvailableGroupId = (block.timestamp + period + gracePeriod) / GROUP_SIZE;
      uint _firstActiveGroupId = block.timestamp / GROUP_SIZE;

      // start with the entire supply and subtract unavailable groups
      uint _stakeSharesSupply = stakeSharesSupply;
      uint availableShares = _stakeSharesSupply;

      for (uint i = _firstActiveGroupId; i < _firstAvailableGroupId; ++i) {
        availableShares -= stakeGroups[i].stakeShares;
      }

      // total stake available without applying product weight
      freeProductStake =
        activeStake * availableShares * product.weight / _stakeSharesSupply / WEIGHT_DENOMINATOR;
    }

    // could happen if is 100% in-use or if the product weight was changed
    if (allocatedProductStake >= freeProductStake) {
      // store expirations
      products[productId].allocatedStake = allocatedProductStake;
      products[productId].lastBucket = currentBucket;
      return (0, 0);
    }

    uint usableStake = freeProductStake - allocatedProductStake;
    newAllocation = min(productStakeAmount, usableStake);

    premium = calculatePremium(
      productId,
      allocatedProductStake,
      usableStake,
      newAllocation,
      period
    );

    products[productId].allocatedStake = allocatedProductStake + newAllocation;
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
    uint productId,
    uint allocatedStake,
    uint usableStake,
    uint newAllocation,
    uint period
  ) public returns (uint) {

    // silence compiler warnings
    allocatedStake;
    usableStake;
    newAllocation;
    period;
    block.timestamp;
    uint nextPrice = 0;
    products[productId].lastPrice = nextPrice;

    return 0;
  }

  function deallocateStake(
    uint productId,
    uint start,
    uint period,
    uint amount,
    uint premium
  ) external onlyCoverContract {

    // silence compiler warnings
    productId;
    start;
    period;
    amount;
    premium;
    activeStake = activeStake;
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
    // silence compiler warnings
    params;
    activeStake = activeStake;
    revert("Not implemented");
  }

  /* views */

  function getActiveStake() external view returns (uint) {
    block.timestamp; // prevents warning about function being pure
    return 0;
  }

  function getProductStake(
    uint productId, uint coverExpirationDate
  ) external view returns (uint) {
    productId;
    coverExpirationDate;
    block.timestamp;
    return 0;
  }

  function getAllocatedProductStake(uint productId) external view returns (uint) {
    productId;
    block.timestamp;
    return 0;
  }

  function getFreeProductStake(
    uint productId, uint coverExpirationDate
  ) external view returns (uint) {
    productId;
    coverExpirationDate;
    block.timestamp;
    return 0;
  }

  /* utils */

  function min(uint a, uint b) internal pure returns (uint) {
    return a < b ? a : b;
  }

  function max(uint a, uint b) internal pure returns (uint) {
    return a > b ? a : b;
  }

}
