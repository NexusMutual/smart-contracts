// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.18;

import "../../../abstract/MasterAwareV2.sol";
import "../../../interfaces/IPooledStaking.sol";
import "../../../interfaces/INXMToken.sol";
import "../../generic/PooledStakingGeneric.sol";

contract TCMockPooledStaking is PooledStakingGeneric {

  mapping(address => uint) public _stakerReward;
  mapping(address => uint) public _stakerDeposit;
  INXMToken internal immutable token;

  event Withdrawn(address indexed staker, uint amount);
  event RewardWithdrawn(address indexed staker, uint amount);

  constructor(address _tokenAddress) {
    token = INXMToken(_tokenAddress);
  }

  // Manually set the staker reward
  function setStakerReward(address staker, uint reward) external {
    _stakerReward[staker] = reward;
  }

  // Manually set the staker deposit
  function setStakerDeposit(address staker, uint deposit) external {
    _stakerDeposit[staker] = deposit;
  }

  function stakerReward(address staker) external override view returns (uint) {
    return _stakerReward[staker];
  }

  function stakerDeposit(address staker) external override view returns (uint) {
    return _stakerDeposit[staker];
  }

  function withdrawForUser(address member) external override {
    uint amount = _stakerDeposit[member];
    _stakerDeposit[member] = 0;
    token.mint(member, amount);
    emit Withdrawn(member, amount);
  }

  function withdrawReward(address member) external override {
    uint amount = _stakerReward[member];
    _stakerReward[member] = 0;
    token.mint(member, amount);
    emit RewardWithdrawn(member, amount);
  }
}
