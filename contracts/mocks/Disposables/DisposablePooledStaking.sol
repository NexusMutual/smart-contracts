// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../interfaces/ITokenController.sol";
import "../../modules/staking/PooledStaking.sol";

contract DisposablePooledStaking is PooledStaking {

  function initialize(
    address _tokenControllerAddress,
    uint minStake,
    uint minUnstake,
    uint maxExposure,
    uint unstakeLockTime
  ) external {

    tokenController = ITokenController(_tokenControllerAddress);
    tokenController.addToWhitelist(address(this));
    initialized = true;

    MIN_STAKE = minStake;
    MIN_UNSTAKE = minUnstake;
    MAX_EXPOSURE = maxExposure;
    UNSTAKE_LOCK_TIME = unstakeLockTime;

    REWARD_ROUND_DURATION = 7 days;
    REWARD_ROUNDS_START = now;
  }

}
