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
        hex'f3b255795e210990de631cbb3a854aa277d4f22ec17cbf9f173a69c82b519224' // init code hash
      )
    );

    // cast last 20 bytes of hash to address
    return address(uint160(uint(hash)));
  }

}
