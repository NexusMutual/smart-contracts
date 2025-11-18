// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../generic/PoolGeneric.sol";

contract PoolEtherRejecterMock is PoolGeneric {

  uint internal mcrValue = 1 ether;

  function getPoolValueInEth() public override virtual view returns (uint) {
    return address(this).balance;
  }

  function getMCR() public override virtual view returns (uint) {
    return mcrValue;
  }

  receive() external payable override {
    revert("I secretly hate ether");
  }

}
