// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/ITokenController.sol";
import "../../modules/legacy/LegacyPooledStaking.sol";

contract DisposablePooledStaking is LegacyPooledStaking {

  function initialize(
    address payable _tokenControllerAddress,
    uint minStake,
    uint minUnstake,
    uint maxExposure,
    uint unstakeLockTime
  ) external {

    internalContracts[uint(ID.TC)] = _tokenControllerAddress;
    ITokenController(_tokenControllerAddress).addToWhitelist(address(this));

    MIN_STAKE = minStake;
    MIN_UNSTAKE = minUnstake;
    MAX_EXPOSURE = maxExposure;
    UNSTAKE_LOCK_TIME = unstakeLockTime;

    REWARD_ROUND_DURATION = 7 days;
    REWARD_ROUNDS_START = block.timestamp;
  }

  constructor() LegacyPooledStaking(
    0x0000000000000000000000000000000000000000,
    0x0000000000000000000000000000000000000000
  ) {
    // noop
  }

}
