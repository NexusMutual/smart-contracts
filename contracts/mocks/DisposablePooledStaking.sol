pragma solidity ^0.5.7;

import "../modules/staking/PooledStaking.sol";
import "../modules/token/TokenController.sol";

// TODO: modify PS and get rid of this contract
contract DisposablePooledStaking is PooledStaking {

  function initialize(
    address _tokenControllerAddress,
    uint minStake,
    uint minUnstake,
    uint maxExposure,
    uint unstakeLockTime
  ) external {

    tokenController = TokenController(_tokenControllerAddress);
    tokenController.addToWhitelist(address(this));
    initialized = true;

    MIN_STAKE = minStake;
    MIN_UNSTAKE = minUnstake;
    MAX_EXPOSURE = maxExposure;
    UNSTAKE_LOCK_TIME = unstakeLockTime;

  }

}
