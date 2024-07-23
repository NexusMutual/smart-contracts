// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/MCRGeneric.sol";

contract P1MockMCR is MCRGeneric {
  uint public _mcr;

  function getMCR() external override view returns (uint) {
      return _mcr;
  }

  function setMCR(uint80 value) public  {
      _mcr = value;
  }

  function mcr() external override view returns (uint80) {
    return uint80(_mcr);
  }

  function updateMCR(uint) public override {
    // no-op
  }

  function updateMCRInternal(bool) public override {
    // no-op
  }

  function changeDependentContractAddress() external {
    // no-op
  }

  function changeMasterAddress(address) external {
    // no-op
  }
}
