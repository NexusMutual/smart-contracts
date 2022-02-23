// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

contract MasterMockForCowSwap {
  address public pool;

  function getLatestAddress(bytes2 module) public view returns (address) {
    require(module == 'P1', 'Mocking only P1');
    return pool;
  }

  function checkIsAuthToGoverned(address who) public pure returns (bool) {
    return true;
  }

  function setPool(address _pool) public {
    pool = _pool;
  }

  function isPause() public pure returns (bool) {
    return false;
  }
}
