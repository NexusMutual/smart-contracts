// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
// TODO: consider using solmate ERC721 implementation
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/INXMToken.sol";

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

  // TODO: this should be allowed to overflow (similar to uniswapv2 twap)
  // accumulated rewarded nxm per reward share
  uint public accNxmPerRewardsShare;

  // timestamp when accNxmPerRewardsShare was last updated
  uint public lastAccNxmUpdate;

  uint public firstActiveGroupId;
  uint public lastActiveGroupId;

  uint public firstActiveBucketId;

  // erc721 supply
  uint public totalSupply;

  // group id => group data
  mapping(uint => Group) public groups;

  // group id => amount
  mapping(uint => ExpiredGroup) public expiredGroups;

  // pool bucket id => PoolBucket
  mapping(uint => PoolBucket) public poolBuckets;

  // product id => pool bucket id => ProductBucket
  mapping(uint => mapping(uint => ProductBucket)) public productBuckets;

  // product id => Product
  mapping(uint => Product) public products;

  // token id => pending reward
  mapping(uint => uint) public pendingRewards;

  // token id => group id => position data
  mapping(uint => mapping(uint => Position)) public positions;

  /* immutables */

  INXMToken public immutable nxm;
  address public immutable coverContract;

  /* constants */

  // 7 * 13 = 91
  uint constant BUCKET_SIZE = 7 days;
  uint constant GROUP_SIZE = 91 days;
  uint constant MAX_GROUPS = 9; // 8 whole quarters + 1 partial quarter

  uint constant REWARDS_SHARES_RATIO = 125;
  uint constant REWARDS_SHARES_DENOMINATOR = 100;
  uint constant WEIGHT_DENOMINATOR = 100;
  uint constant REWARDS_DENOMINATOR = 100;

  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint public constant PRODUCT_WEIGHT_DENOMINATOR = 10_000;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 10_000;
  uint public constant INITIAL_PRICE_DENOMINATOR = 10_000;

  modifier onlyCoverContract {
    require(msg.sender == coverContract, "StakingPool: Only Cover contract can call this function");
    _;
  }

  modifier onlyManager {
    require(_isApprovedOrOwner(msg.sender, 0), "StakingPool: Only pool manager can call this function");
    _;
  }

  constructor (
    string memory _name,
    string memory _symbol,
    address _token,
    address _coverContract
  ) ERC721(_name, _symbol) {
    nxm = INXMToken(_token);
    coverContract = _coverContract;
  }

  function initialize(
    address _manager,
    ProductInitializationParams[] calldata params
  ) external onlyCoverContract {
    // create ownership nft
    _mint(_manager, 0);
    totalSupply = 1;
    // TODO: initialize products
    params;
  }

  // used to transfer all nfts when a user switches the membership to a new address
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
    uint _firstActiveGroupId = firstActiveGroupId;

    uint currentBucketId = block.timestamp / BUCKET_SIZE;
    uint currentGroupId = block.timestamp / GROUP_SIZE;

    // populate if the pool is new
    if (_firstActiveBucketId == 0) {
      firstActiveBucketId = currentBucketId;
      firstActiveGroupId = currentGroupId;
      return;
    }

    if (_firstActiveBucketId == currentBucketId) {
      return;
    }

    // SLOAD
    uint _activeStake = activeStake;
    uint _rewardPerSecond = rewardPerSecond;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _lastAccNxmUpdate = lastAccNxmUpdate;

    while (_firstActiveBucketId < currentBucketId) {

      ++_firstActiveBucketId;
      uint bucketEndTime = _firstActiveBucketId * BUCKET_SIZE;
      uint elapsed = bucketEndTime - _lastAccNxmUpdate;

      // todo: should be allowed to overflow?
      // todo: handle division by zero
      _accNxmPerRewardsShare += elapsed * _rewardPerSecond / _rewardsSharesSupply;
      _lastAccNxmUpdate = bucketEndTime;
      // TODO: use _firstActiveBucketId before incrementing it?
      _rewardPerSecond -= poolBuckets[_firstActiveBucketId].rewardPerSecondCut;

      // should we expire a group?
      if (
        bucketEndTime % GROUP_SIZE != 0 ||
        _firstActiveGroupId == currentGroupId
      ) {
        continue;
      }

      // todo: handle _firstActiveGroupId = 0 case

      // SLOAD
      Group memory group = groups[_firstActiveGroupId];

      // todo: handle division by zero
      uint expiredStake = _activeStake * group.stakeShares / _stakeSharesSupply;

      // the group is expired now so we decrease the stake and share supply
      _activeStake -= expiredStake;
      _stakeSharesSupply -= group.stakeShares;
      _rewardsSharesSupply -= group.rewardsShares;

      // todo: update nft 0

      group.stakeShares = 0;
      group.rewardsShares = 0;

      // SSTORE
      groups[_firstActiveGroupId] = group;
      expiredGroups[_firstActiveGroupId] = ExpiredGroup(
        _accNxmPerRewardsShare, // accNxmPerRewardShareAtExpiry
        // TODO: should this be before or after active stake reduction?
        _activeStake, // stakeAmountAtExpiry
        _stakeSharesSupply // stakeShareSupplyAtExpiry
      );

      // advance to the next group
      _firstActiveGroupId++;
    }

    {
      uint elapsed = block.timestamp - _lastAccNxmUpdate;
      _accNxmPerRewardsShare += elapsed * _rewardPerSecond / _rewardsSharesSupply;
      _lastAccNxmUpdate = block.timestamp;
    }

    firstActiveGroupId = _firstActiveGroupId;
    firstActiveBucketId = _firstActiveBucketId;

    activeStake = _activeStake;
    rewardPerSecond = _rewardPerSecond;
    accNxmPerRewardsShare = _accNxmPerRewardsShare;
    lastAccNxmUpdate = _lastAccNxmUpdate;
    stakeSharesSupply = _stakeSharesSupply;
    rewardsSharesSupply = _rewardsSharesSupply;
  }

  function deposit(
    uint amount,
    uint groupId,
    uint _tokenId
  ) external returns (uint tokenId) {

    updateGroups();

    {
      uint _firstActiveGroupId = block.timestamp / GROUP_SIZE;
      uint maxGroup = _firstActiveGroupId + MAX_GROUPS;
      require(groupId <= maxGroup, "StakingPool: Requested group is not yet active");
      require(groupId >= _firstActiveGroupId, "StakingPool: Requested group has expired");
      require(amount > 0, "StakingPool: Insufficient deposit amount");
    }

    // deposit to token id = 0 is not allowed
    // we treat it as a flag to create a new token
    bool isNewToken = _tokenId == 0;

    if (isNewToken) {
      tokenId = totalSupply++;
      _mint(msg.sender, tokenId);
    } else {
      tokenId = _tokenId;
    }

    // transfer nxm from staker
    // TODO: use TokenController.operatorTransfer instead and transfer to TC
    nxm.transferFrom(msg.sender, address(this), amount);

    /* storage reads */

    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    Group memory group = groups[groupId];

    // conditional read
    uint pendingReward = isNewToken ? 0 : pendingRewards[tokenId];

    // conditional read
    Position memory position = isNewToken
      ? Position(_accNxmPerRewardsShare, 0, 0)
      : positions[tokenId][groupId];

    /* end storage reads */

    /* calculate and update pending reward */

    // position could be empty even if the token is not new
    if (position.lastAccNxmPerRewardShare != 0) {
      uint newEarningsPerShare = _accNxmPerRewardsShare - position.lastAccNxmPerRewardShare;
      pendingReward += newEarningsPerShare * position.rewardsShares;
    }

    position.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;

    /* end calculate and update pending reward */

    uint newStakeShares = _stakeSharesSupply == 0
      ? sqrt(amount)
      : _stakeSharesSupply * amount / _activeStake;

    uint newRewardsShares = calculateRewardSharesAmount(newStakeShares, groupId);

    group.stakeShares += newStakeShares;
    group.rewardsShares += newRewardsShares;

    /* storage writes */

    // update globals
    activeStake = _activeStake + amount;
    stakeSharesSupply = _stakeSharesSupply + newStakeShares;
    rewardsSharesSupply = _rewardsSharesSupply + newRewardsShares;

    // update group and staker data
    groups[groupId] = group;
    positions[tokenId][groupId] = position;
    pendingRewards[tokenId] = pendingReward;

    /* end storage writes */
  }

  function calculateRewardSharesAmount(
    uint stakeSharesAmount,
    uint groupId
  ) internal view returns (uint) {

    uint lockDuration = (groupId + 1) * GROUP_SIZE - block.timestamp;
    uint maxLockDuration = GROUP_SIZE * 8;

    // TODO: determine extra rewards formula
    return
      stakeSharesAmount
      * REWARDS_SHARES_RATIO
      * lockDuration
      / REWARDS_SHARES_DENOMINATOR
      / maxLockDuration;
  }

  function withdraw(WithdrawParams[] calldata params) external {

    updateGroups();

    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _firstActiveGroupId = block.timestamp / GROUP_SIZE;

    for (uint i = 0; i < params.length; i++) {

      uint stakeToWithdraw;
      uint rewardToWithdraw;

      uint tokenId = params[i].tokenId;
      uint groupCount = params[i].groupIds.length;

      for (uint j = 0; j < groupCount; j++) {

        uint groupId = params[i].groupIds[j];
        Position memory position = positions[tokenId][groupId];

        // can withdraw stake only if the group is expired
        if (params[i].withdrawStake && groupId < _firstActiveGroupId) {

          // calculate the amount of nxm for this position
          uint stake = expiredGroups[groupId].stakeAmountAtExpiry;
          uint stakeShareSupply = expiredGroups[groupId].stakeShareSupplyAtExpiry;
          stakeToWithdraw += stake * position.stakeShares / stakeShareSupply;

          // mark as withdrawn
          position.stakeShares = 0;
        }

        if (params[i].withdrawRewards) {

          // calculate reward since checkpoint
          uint newRewardPerShare = _accNxmPerRewardsShare - position.lastAccNxmPerRewardShare;
          rewardToWithdraw += newRewardPerShare * position.rewardsShares;

          // save checkpoint
          position.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;
        }

        positions[tokenId][groupId] = position;
      }

      uint withdrawable = stakeToWithdraw + rewardToWithdraw;

      if (params[i].withdrawRewards) {
        withdrawable += pendingRewards[tokenId];
        pendingRewards[tokenId] = 0;
      }

      // TODO: use TC instead
      nxm.transfer(ownerOf(tokenId), withdrawable);
    }
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
      // group expiration must exceed the cover period
      uint _firstAvailableGroupId = (block.timestamp + period + gracePeriod) / GROUP_SIZE;
      uint _firstActiveGroupId = block.timestamp / GROUP_SIZE;

      // start with the entire supply and subtract unavailable groups
      uint _stakeSharesSupply = stakeSharesSupply;
      uint availableShares = _stakeSharesSupply;

      for (uint i = _firstActiveGroupId; i < _firstAvailableGroupId; ++i) {
        availableShares -= groups[i].stakeShares;
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

    {
      uint usableStake = freeProductStake - allocatedProductStake;
      newAllocation = min(productStakeAmount, usableStake);

      premium = calculatePremium(
        productId,
        allocatedProductStake,
        usableStake,
        newAllocation,
        period
      );
    }

    // 1 SSTORE
    products[productId].allocatedStake = allocatedProductStake + newAllocation;
    products[productId].lastBucket = currentBucket;

    {
      require(rewardRatio <= REWARDS_DENOMINATOR, "StakingPool: reward ratio exceeds denominator");

      // divCeil = fn(a, b) => (a + b - 1) / b
      uint expireAtBucket = (block.timestamp + period + BUCKET_SIZE - 1) / BUCKET_SIZE;
      uint _rewardPerSecond =
        premium * rewardRatio / REWARDS_DENOMINATOR
        / (expireAtBucket * BUCKET_SIZE - block.timestamp);

      // 2 SLOAD + 2 SSTORE
      productBuckets[productId][expireAtBucket].allocationCut += newAllocation;
      poolBuckets[expireAtBucket].rewardPerSecondCut += _rewardPerSecond;
    }
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

  /* nft */

  function _beforeTokenTransfer(
    address from,
    address /*to*/,
    uint256 tokenId
  ) internal view override {
    require(
      tokenId != 0 || nxm.isLockedForMV(from) < block.timestamp,
      "StakingPool: Locked for voting in governance"
    );
  }

  /* pool management */

  function setProductDetails(ProductParams[] memory params) external onlyManager {
    // silence compiler warnings
    params;
    activeStake = activeStake;
    // [todo] Implement
  }

  /* views */

  function getActiveStake() external view returns (uint) {
    block.timestamp; // prevents warning about function being pure
    return 0;
  }

  function getProductStake(
    uint productId, uint coverExpirationDate
  ) public view returns (uint) {
    productId;
    coverExpirationDate;
    block.timestamp;
    return 0;
  }

  function getAllocatedProductStake(uint productId) public view returns (uint) {
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

  function manager() external view returns (address) {
    return ownerOf(0);
  }

  /* management */

  function addProducts(ProductParams[] memory params) external onlyManager {
    params;
  }

  function removeProducts(uint[] memory productIds) external onlyManager {
    productIds;
  }

  /* utils */

  function getPriceParameters(
    uint productId
  ) external override view returns (
    uint activeCover, uint[] memory staked, uint lastBasePrice, uint targetPrice
  ) {

    activeCover = getAllocatedProductStake(productId);

    uint maxGroupSpanCount = ICover(coverContract).MAX_COVER_PERIOD() / GROUP_SIZE + 1;
    staked = new uint[](maxGroupSpanCount);
    for (uint i = 0; i < maxGroupSpanCount; i++) {
      staked[i] = getProductStake(productId, block.timestamp + i * GROUP_SIZE);
    }

    lastBasePrice = lastBasePrices[productId].value;
    targetPrice = targetPrices[productId];
  }

  function min(uint a, uint b) internal pure returns (uint) {
    return a < b ? a : b;
  }

  function max(uint a, uint b) internal pure returns (uint) {
    return a > b ? a : b;
  }

  // babylonian method
  function sqrt(uint y) internal pure returns (uint) {

    if (y > 3) {
      uint z = y;
      uint x = y / 2 + 1;
      while (x < z) {
        z = x;
        x = (y / x + x) / 2;
      }
      return z;
    }

    if (y != 0) {
      return 1;
    }

    return 0;
  }
}
