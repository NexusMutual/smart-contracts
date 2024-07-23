// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IMCR.sol";
import "../../../interfaces/INXMToken.sol";
import "../../../interfaces/IPool.sol";
import "../../../abstract/MasterAwareV2.sol";
import "../../../libraries/Math.sol";
import "../../generic/MCRGeneric.sol";

contract RAMockMCR is MCRGeneric {

  uint public mockMCRValue;
  uint public lastMCRUpdateTime;

  INXMMaster public master;
  IPool public pool;

  constructor (address _masterAddress) {
    master = INXMMaster(_masterAddress);
    lastMCRUpdateTime = block.timestamp;
  }

  function setPool(address _poolAddress) public override {
    pool = IPool(_poolAddress);
  }

  function getMCR() external override view returns (uint) {
    return mockMCRValue;
  }

  function updateMCR(uint newMCRValue) public override {
    mockMCRValue = newMCRValue;
  }

  function updateMCRInternal(bool) public override {
    lastMCRUpdateTime = block.timestamp;
  }
}
