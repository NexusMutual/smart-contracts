// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

/**
 * @dev This is the interface that {BeaconProxy} expects of its beacon.
 */
interface IStakingPoolBeacon {
  /**
   * @dev Must return an address that can be used as a delegate call target.
   *
   * {BeaconProxy} will check that this address is a contract.
   */
  function stakingPoolImplementation() external view returns (address);
}
