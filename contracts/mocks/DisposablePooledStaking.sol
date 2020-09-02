pragma solidity ^0.5.0;

import "../modules/staking/PooledStaking.sol";

contract DisposablePooledStaking is PooledStaking {

  function initialize(
    uint minStake,
    uint minUnstake,
    uint maxExposure,
    uint unstakeLockTime,
    uint rewardRoundsStartTime,
    uint rewardRoundDuration
  ) external {

    MIN_STAKE = minStake;
    MIN_UNSTAKE = minUnstake;
    MAX_EXPOSURE = maxExposure;
    UNSTAKE_LOCK_TIME = unstakeLockTime;
    REWARD_ROUNDS_START = rewardRoundsStartTime;
    REWARD_ROUND_DURATION = rewardRoundDuration;

  }

}
