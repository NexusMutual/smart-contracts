// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/MCRGeneric.sol";

contract COMockMCR is MCRGeneric {

  uint public mockMCRValue;

  function getMCR() external override view returns (uint) {
    return mockMCRValue;
  }

  function setMCR(uint _mcrValue) external {
    mockMCRValue = _mcrValue;
  }
}
