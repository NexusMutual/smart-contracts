// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMinimalStakingPool {
  function manager() external view returns (address);

  function activeStake() external view returns (uint);
}
