// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";

contract StakingVe is ERC721 {
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

  // stakers are grouped based on the timelock expiration
  // group index is calculated based on the expiration date
  // the initial proposal is to have 4 groups per year (1 group per quarter)
  struct StakeGroup {
    uint stakeShares;
    uint rewardsShares;
    uint groupSharesSupply;
    uint accRewardPerStakeShareAtExpiration;
    uint expiredStakeAmount;
  }

  struct PoolBucket {
    uint rewardPerSecondCut;
  }

  struct ProductBucket {
    uint capacityCut;
  }

  // group id => amount
  mapping(uint => StakeGroup) public stakeGroups;

  // pool bucket id => PoolBucket
  mapping(uint => PoolBucket) public poolBuckets;

  // pool bucket id => ProductBucket
  mapping(uint => ProductBucket) public productBuckets;

  // nft id => group id => amount of group shares
  mapping(uint => mapping(uint => uint)) public balanceOf;

  /* immutables */

  IERC20 public immutable nxm;

  /* constants */

  // 7 * 13 = 91
  uint BUCKET_SIZE = 7 days;
  uint GROUP_SIZE = 91 days;

  constructor (
    string memory _name,
    string memory _symbol,
    IERC20 _token
  ) ERC721(_name, _symbol) {
    nxm = _token;
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

    // the group and pool bucket ids for the current timestamp
    uint currentGroupId = block.timestamp / GROUP_SIZE;

    while (_firstActiveBucketId < currentBucketId) {

      ++_firstActiveBucketId;
      uint bucketEndTime = _firstActiveBucketId * BUCKET_SIZE;
      uint elapsed = bucketEndTime - _lastRewardUpdate;

      _accRewardPerShare += elapsed * _rewardPerSecond / _rewardsSharesSupply;
      _lastRewardUpdate = bucketEndTime;

      // should we expire a group?
      if (
        bucketEndTime % GROUP_SIZE != 0 ||
        _firstActiveGroupId == currentGroupId
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

    // TODO: calculate based on time till group expiry
    // temporarily hardcoding a x1.1 multiplier
    uint newRewardsShares = newStakeShares * 110 / 100;

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

  // O(1)
  function burn(uint amount) public {

    // TODO: restrict msg sender to Cover contract only

    updateGroups();

    // I think it's enough to only decrease the active stake amount (!)
    activeStake -= amount;

    // TODO: optionally enfore max 99% burn to avoid share super-inflation
  }

}
