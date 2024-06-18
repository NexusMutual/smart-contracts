// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../generic/StakingPoolFactoryGeneric.sol";

contract CPMockStakingPoolFactory is StakingPoolFactoryGeneric {

  uint96 internal _stakingPoolCount;

  function stakingPoolCount() external override view returns (uint) {
    return _stakingPoolCount;
  }

  function setStakingPoolCount(uint count) public override {
    _stakingPoolCount = uint96(count);
  }
}
