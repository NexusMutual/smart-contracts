// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.18;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IPooledStaking.sol";

contract TCMockPooledStaking {

  mapping(address => uint) public stakerReward;
  mapping(address => uint) public stakerDeposit;

  // Manually set the staker reward
  function setStakerReward(address staker, uint reward) external {
    stakerReward[staker] = reward;
  }

  // Manually set the staker deposit
  function setStakerDeposit(address staker, uint deposit) external {
    stakerDeposit[staker] = deposit;
  }
}
