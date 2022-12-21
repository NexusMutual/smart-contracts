// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

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
        hex'203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920' // init code hash
      )
    );

    // cast last 20 bytes of hash to address
    return address(uint160(uint(hash)));
  }

}
