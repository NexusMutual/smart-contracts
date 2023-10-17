// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

/**
 * @dev Simple library to derive the staking pool address from the pool id without external calls
 */
library StakingPoolLibrary {

  function getAddress(address factory, uint poolId) internal pure returns (address) {

    bytes32 hash = keccak256(
      abi.encodePacked(
        hex'ff',
        factory,
        poolId, // salt
        // init code hash of the MinimalBeaconProxy
        // updated using patch-staking-pool-library.js script
        hex'a179a0142e16e99d0ddc0c8b371af706365954d4a192468bf0375ed4995b5946' // init code hash
      )
    );

    // cast last 20 bytes of hash to address
    return address(uint160(uint(hash)));
  }

}
