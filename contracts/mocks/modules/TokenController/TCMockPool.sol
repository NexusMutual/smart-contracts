// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/PoolGeneric.sol";

contract TCMockPool is PoolGeneric {
  function getTokenPrice() public override pure returns (uint) {
    return 1 ether;
  }
}
