// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../modules/staking/StakingProducts.sol";

contract SPMockStakingProducts is StakingProducts {

  constructor(
    address _coverContract,
    address _stakingPoolFactory
  ) StakingProducts(_coverContract, _stakingPoolFactory) {
    // noop
  }

  function setInitialProducts(uint poolId, ProductInitializationParams[] memory params) public {
    _setInitialProducts(poolId, params);
  }

}
