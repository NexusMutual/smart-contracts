// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../generic/PoolGeneric.sol";

contract RGMockPool is PoolGeneric {

  receive() external payable override { }

}
