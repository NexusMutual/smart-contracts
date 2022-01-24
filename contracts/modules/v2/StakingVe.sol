// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";

contract StakingVe is ERC721 {
  using SafeCast for uint;

  /* storage */

  // current active stake amount
  uint128 public totalStaked;

  // current nxm reward per bucket (1 bucket = 1 week)
  uint128 public rewardRate;

  // accumulated reward per second
  uint128 public accRewardPerSecond;

  uint32 public lastRewardUpdate;
  uint16 public firstGroupId;
  uint16 public lastGroupId;

  // erc721 related
  uint32 public totalSupply;

  // stakers are grouped based on the timelock expiration
  // group index is calculated based on the expiration date
  // the initial proposal is to have 4 groups per year (1 group per quarter)
  struct StakeGroup {
    uint128 stake;
    uint128 shares;
    uint128 accRewardPerToken;
    /* uint128 unused */
  }

  // group id => amount
  mapping(uint16 => StakeGroup) public stakeGroups;

  // user => group id => amount of shares
  mapping(address => mapping(uint16 => uint)) public balanceOf;

  /* immutables */

  IERC20 public immutable nxm;

  /* constants */

  // 91 * 4 = 364
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

    // 1 SLOAD
    uint _totalStaked = totalStaked;
    uint _rewardRate = rewardRate;

    // 1 SLOAD
    uint32 _lastRewardUpdate = lastRewardUpdate;
    uint16 _firstGroupId = firstGroupId;

    // the group id for the current timestamp
    uint16 target = (block.timestamp / GROUP_SIZE).toUint16();

    while (_firstGroupId < target) {

      // 2 SLOADs
      StakeGroup memory group = stakeGroups[_firstGroupId];

      // calculate group reward
      uint expiredAt = (_firstGroupId + 1) * GROUP_SIZE;
      uint elapsed = expiredAt - group.lastRewardTimestamp;
      uint rewardPerSecond = _rewardRate / _totalStaked;

      // pool_earnings = elapsed * reward_per_second
      // group_share = group_stake / total_staked
      // group_earnings = pool_earnings * group_share
      group.accRewardPerToken += (elapsed * _rewardPerSecond * group.stake / _totalStaked).toUint128();

      // 2 SSTOREs
      stakeGroups[_firstGroupId] = group;

      // unstake!
      _totalStaked -= group.stake;
      _firstGroupId++;
    }

    firstGroupId = _firstGroupId;
    totalStaked = _totalStaked.toUint128();
  }

  function deposit(uint amount, uint16 groupId) external {

    updateGroups();

    // require groupId not to be expired
    require(groupId >= firstGroupId);

    // transfer nxm from staker
    nxm.transferFrom(msg.sender, address(this), amount);

    uint stake = stakeGroups[groupId].stake;
    uint shares = stakeGroups[groupId].shares;

    uint userShares = balanceOf[msg.sender][groupId];
    uint newShares = amount * shares / stake;

    // 1 SSTORE update group stake and shares
    stakeGroups[groupId].stake = (stake + amount).toUint128();
    stakeGroups[groupId].shares = (shares + newShares).toUint128();

    // 1 SSTORE update staker's group shares
    balanceOf[msg.sender][groupId] = (userShares + newShares).toUint128();

    // 1 SSTORE update total active stake
    totalStaked += amount.toUint128();

    // 2 SSTORE mint nft
    _mint(msg.sender, totalSupply++);
  }

  // O(16) ie. O(1)
  function burn(uint amount) public {

    updateGroups();

    // 1 SLOAD
    uint totalStake = totalStaked;
    uint16 first = firstGroupId;
    uint16 last = lastGroupId;

    for (uint16 i = first; i <= last; i++) {
      // 1 SLOAD
      uint stake = stakeGroups[i].stake;
      uint burnAmount = stake * amount / totalStake;
      // 1 SSTORE
      stakeGroups[i].stake -= burnAmount.toUint128();
    }
  }

}
