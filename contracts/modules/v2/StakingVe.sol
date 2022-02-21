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

  // supply of pool shares used by groups
  uint public poolSharesSupply;

  // current nxm reward per second
  uint public rewardPerSecond;

  // accumulated reward per token
  uint public accRewardPerToken;

  // last accRewardPerToken update timestamp
  uint public lastRewardUpdate;

  uint public firstActiveGroupId;
  uint public lastActiveGroupId;

  // erc721 supply
  uint public totalSupply;

  // stakers are grouped based on the timelock expiration
  // group index is calculated based on the expiration date
  // the initial proposal is to have 4 groups per year (1 group per quarter)
  struct StakeGroup {
    uint poolShares;
    uint groupSharesSupply;
    uint accRewardPerTokenAtExpiration;
    uint expiredStakeAmount;
  }

  struct PoolBucket {
    uint rewardPerSecondCut;
  }

  // group id => amount
  mapping(uint => StakeGroup) public stakeGroups;

  // pool bucket id => PoolBucket
  mapping(uint => PoolBucket) public poolBuckets;

  // nft id => group id => amount of shares
  mapping(uint => mapping(uint => uint)) public balanceOf;

  /* immutables */

  IERC20 public immutable nxm;

  /* constants */

  // 90 * 4 = 360
  // 91 * 4 = 364
  // 92 * 4 = 368
  uint GROUP_SIZE = 91 days;

  constructor (
    string memory _name,
    string memory _symbol,
    IERC20 _token
  ) ERC721(_name, _symbol) {
    nxm = _token;
  }

  // TODO: this should be combined with the processPoolBuckets function
  function updateGroups() public {

    // SLOAD
    uint _activeStake = activeStake;
    uint _rewardPerSecond = rewardPerSecond;
    uint _accRewardPerToken = accRewardPerToken;
    uint _poolSharesSupply = poolSharesSupply;

    // SLOAD
    uint _lastRewardUpdate = lastRewardUpdate;
    uint _firstActiveGroupId = firstActiveGroupId;

    // the group id for the current timestamp
    uint currentGroupId = block.timestamp / GROUP_SIZE;

    while (_firstActiveGroupId < currentGroupId) {

      // TODO: check pool buckets expiration here and update _accRewardPerToken & _lastRewardUpdate

      // SLOAD
      StakeGroup memory group = stakeGroups[_firstActiveGroupId];

      // calculate group reward
      uint groupExpirationTime = (_firstActiveGroupId + 1) * GROUP_SIZE;
      uint elapsed = groupExpirationTime - _lastRewardUpdate;

      _accRewardPerToken += elapsed * _rewardPerSecond / _activeStake;
      _lastRewardUpdate = groupExpirationTime;
      uint expiredStake = _activeStake * group.poolShares / _poolSharesSupply;

      _activeStake -= expiredStake;
      _poolSharesSupply -= group.poolShares;

      group.accRewardPerTokenAtExpiration = _accRewardPerToken;
      group.expiredStakeAmount = expiredStake;

      // SSTORE
      stakeGroups[_firstActiveGroupId] = group;

      // advance to the next group
      _firstActiveGroupId++;
    }

    firstActiveGroupId = _firstActiveGroupId;
    activeStake = _activeStake;
  }

  function deposit(
    uint amount,
    uint groupId,
    uint _positionId
  ) external returns (uint positionId) {

    updateGroups();

    // require groupId not to be expired
    require(groupId >= firstActiveGroupId);

    // transfer nxm from staker
    nxm.transferFrom(msg.sender, address(this), amount);

    StakeGroup memory group = stakeGroups[groupId];

    // TODO: double-check that the incresae should happen here
    uint _activeStake = activeStake + amount;
    uint _poolSharesSupply = poolSharesSupply;

    uint newPoolShares = _poolSharesSupply == 0
      ? amount
      : _poolSharesSupply * amount / _activeStake;

    uint newGroupShares;

    if (group.groupSharesSupply == 0) {
      newGroupShares = amount;
    } else {
      // TODO: the math here is wrong
      uint groupStake = 0;
      newGroupShares = group.groupSharesSupply * amount / groupStake;
    }

    group.groupSharesSupply += newGroupShares;
    group.poolShares += newPoolShares;

    if (_positionId == 0) {
      positionId = totalSupply++;
      _mint(msg.sender, positionId);
    } else {
      positionId = _positionId;
    }

    // TODO: update accRewardPerToken & lastRewardUpdate here

    // SSTORE
    stakeGroups[groupId] = group;
    balanceOf[positionId][groupId] += newGroupShares;

    // SSTORE
    activeStake = _activeStake;
    poolSharesSupply = _poolSharesSupply + newPoolShares;
  }

  // O(16) ie. O(1)
  function burn(uint amount) public {

    updateGroups();

    // 1 SLOAD
    uint _activeStake = activeStake;
    uint first = firstActiveGroupId;
    uint last = lastActiveGroupId;

    for (uint i = first; i <= last; i++) {
      // TODO: burn shares instead
      // uint stake = stakeGroups[i].stake;
      // uint burnAmount = stake * amount / _activeStake;
      // stakeGroups[i].stake -= burnAmount;
    }
  }

}
