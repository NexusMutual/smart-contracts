// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";

contract StakingVe is ERC721 {

  /* storage */

  uint96 public stakeActive;
  uint96 public stakeInactive;
  uint96 public stakeBurned;

  uint96 public shareSupply;

  uint16 firstGroupId;
  uint16 lastGroupId;

  // stakers are grouped based on the timelock expiration
  // group index is calculated from the expiration
  // the initial proposal is to have 4 groups per year (1 group per quarter)
  // when staking, all non-expired groups have to be incremented by the amount
  // we can pack 2 groups in a slot, resulting in 2 slots per year, 8 slots for 4 years
  // group id => amount
  mapping(uint => uint) public stakeGroups;

  // group id =>
  mapping(uint => uint) public earnings;

  /* immutables */

  IERC20 public immutable nxm;

  constructor (
    string memory _name,
    string memory _symbol,
    IERC20 _token
  ) ERC721(_name, _symbol) {
    nxm = _token;
  }

  function deposit(uint amount, uint fromGroup, uint toGroup) external {

    // transfer nxm from staker
    nxm.transfer(msg.sender, amount);

    // update buckets
    for (uint i = fromGroup; i <= toGroup; i++) {
      stakeGroups[i].stake += amount;
    }

    _mint(msg.sender, totalSupply++);
  }

  // O(16) ie. O(1)
  function burn(uint amount) {

    uint first = firstGroupId;
    uint last = lastGroupId;

    for (uint i = first + 1; i <= last; i++) {
      stakeGroups[i].stake -= amount;
    }
  }

}
