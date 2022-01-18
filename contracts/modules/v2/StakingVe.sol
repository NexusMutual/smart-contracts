// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";

contract StakingVe is ERC721 {
  using SafeCast for uint;

  /* storage */

  uint128 public stakeActive;
  uint128 public accRewardPerToken;
  uint32 public lastRewardUpdate;

  uint16 public currentGroupId;
  uint16 public lastGroupId;

  // erc721 related
  uint32 public totalSupply;

  // stakers are grouped based on the timelock expiration
  // group index is calculated based on the expiration date
  // the initial proposal is to have 4 groups per year (1 group per quarter)
  struct StakeGroup {
    uint128 stake;
    uint128 shares;
  }

  // group id => amount
  mapping(uint16 => StakeGroup) public stakeGroups;

  // user => group id => amount of shares
  mapping(address => mapping(uint16 => uint)) public balanceOf;

  // group id => earned
  mapping(uint16 => uint) public earned;

  /* immutables */

  IERC20 public immutable nxm;

  /* constants */

  uint GROUP_SIZE = 90 days;

  constructor (
    string memory _name,
    string memory _symbol,
    IERC20 _token
  ) ERC721(_name, _symbol) {
    nxm = _token;
  }

  function processGroups() public {

    uint16 targetId = (block.timestamp / GROUP_SIZE).toUint16();
    uint16 currentId = currentGroupId;
    uint stake = stakeActive;

    while (currentId < targetId) {
      // TODO: update group rewards
      stake += stakeGroups[currentId].stake;
      currentId++;
    }

    currentGroupId = currentId;
  }

  function deposit(uint amount, uint16 groupId) external {

    processGroups();

    // require groupId not to be expired
    require(groupId >= currentGroupId);

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
    stakeActive += amount.toUint128();

    // 2 SSTORE mint nft
    _mint(msg.sender, totalSupply++);
  }

  // O(16) ie. O(1)
  function burn(uint amount) public {

    processGroups();

    // 1 SLOAD
    uint totalStake = stakeActive;
    uint16 first = currentGroupId;
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
