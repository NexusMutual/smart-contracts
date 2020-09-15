/*
    Copyright (C) 2020 NexusMutual.io

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/
*/

pragma solidity ^0.5.17;

import "../PooledStaking.sol";

contract ConfigurablePooledStaking is PooledStaking {

  function initializeMock(
    uint minStake,
    uint minUnstake,
    uint maxExposure,
    uint unstakeLockTime,
    uint rewardRoundDuration
  ) public {

    MIN_STAKE = minStake;
    MIN_UNSTAKE = minUnstake;
    MAX_EXPOSURE = maxExposure;
    UNSTAKE_LOCK_TIME = unstakeLockTime;
    REWARD_ROUNDS_START = now;
    REWARD_ROUND_DURATION = rewardRoundDuration;
  }

  function legacy_pushReward(address contractAddress, uint amount) external whenNotPausedAndInitialized {

    rewards[++lastRewardId] = Reward(amount, now, contractAddress);

    if (firstReward == 0) {
      firstReward = lastRewardId;
    }

    emit RewardRequested(contractAddress, amount);
  }

  function setRewardRoundStart(uint value) external {
    REWARD_ROUNDS_START = value;
  }
}
