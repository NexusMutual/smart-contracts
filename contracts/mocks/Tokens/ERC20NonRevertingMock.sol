// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

/// This contract doesn't implement ERC20 correctly on purpose to be able to test
/// what happens when returndata length from the transfer function differs from what
/// is usually expected.
contract ERC20NonRevertingMock  {

  function balanceOf(address) public pure returns (uint256) {
    return 0 ether;
  }

  function transfer(address, uint256) public {
    // noop
  }

}
