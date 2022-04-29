// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

import "./IStakingPool.sol";

interface IStakingPoolCreator {
  function stakingPool(uint index) external view returns (IStakingPool);

  function createStakingPool(
    address manager,
    uint poolId,
    ProductInitializationParams[] calldata params
  ) external returns (address stakingPoolAddress);
}