// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IStakingPoolFactoryDetailed {

  function stakingPoolCount() external view returns (uint);

  function beacon() external view returns (address);

  function create(address beacon) external returns (uint poolId, address stakingPoolAddress);

  function changeOperator(address newOperator) external;
}
