// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "./PoolMock.sol";

contract PoolEtherRejecterMock is PoolMock {

  receive() external payable override {
    revert("I secretly hate ether");
  }

}
