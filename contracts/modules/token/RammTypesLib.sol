// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

// [ timestamp | eth reserve | nxm reserve ]
//    32 bits     112 bits      112 bits
type Reserve is uint;

library RammTypesLib {

  function timestamp(Reserve r) internal pure returns (uint32) {
    return uint32(Reserve.unwrap(r) >> 224);
  }

  function eth(Reserve r) internal pure returns (uint112) {
    return uint112(Reserve.unwrap(r) >> 112);
  }

  function nxm(Reserve r) internal pure returns (uint112) {
    return uint112(Reserve.unwrap(r));
  }

  function setTimestamp(Reserve r, uint32 _timestamp) internal pure returns (Reserve) {
    uint mask = ~(uint(type(uint32).max) << 224);
    uint underlying = Reserve.unwrap(r) & mask | (uint(_timestamp) << 224);
    return Reserve.wrap(underlying);
  }

  function setEth(Reserve r, uint112 _eth) internal pure returns (Reserve) {
    uint mask = ~(uint(type(uint112).max) << 112);
    uint underlying = Reserve.unwrap(r) & mask | (uint(_eth) << 112);
    return Reserve.wrap(underlying);
  }

  function setNxm(Reserve r, uint112 _nxm) internal pure returns (Reserve) {
    uint mask = ~(uint(type(uint112).max));
    uint underlying = Reserve.unwrap(r) & mask | uint(_nxm);
    return Reserve.wrap(underlying);
  }
}
