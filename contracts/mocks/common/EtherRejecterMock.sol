// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

contract EtherRejecterMock {

  receive() external payable {
    revert("I secretly hate ether");
  }

}
