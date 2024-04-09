// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.18;

import "../../../abstract/MasterAwareV2.sol";
import "../../generic/PooledStakingGeneric.sol";

contract MRMockPooledStaking is PooledStakingGeneric {

  mapping(address => uint) public _stakerReward;
  mapping(address => uint) public _stakerDeposit;

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
}
