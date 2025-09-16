// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../generic/PoolGeneric.sol";

contract PoolEtherRejecterMock is PoolGeneric {

  receive() external payable override {
    revert("I secretly hate ether");
  }

}
