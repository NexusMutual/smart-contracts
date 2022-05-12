// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

contract MRMockPool {
  bool public revertOnTransfers;

  function setRevertOnTransfers(bool value) public {
    revertOnTransfers = value;
  }

  fallback() external payable {
    require(!revertOnTransfers);
  }

  receive() external payable {
    require(!revertOnTransfers);
  }

}
