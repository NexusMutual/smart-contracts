// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../libraries/Math.sol";

contract RammMockMCR is IMCR {

  uint public mockMCRValue;
  uint public lastMCRUpdateTime;

  INXMMaster public master;
  IPool public pool;

  constructor (address _masterAddress) {
    master = INXMMaster(_masterAddress);
    lastMCRUpdateTime = block.timestamp;
  }

  function setPool(address _poolAddress) public {
    pool = IPool(_poolAddress);
  }

  function getMCR() public view returns (uint) {
    return mockMCRValue;
  }

  function updateMCR(uint newMCRValue) public {
    mockMCRValue = newMCRValue;
  }

  function updateMCRInternal(bool) public {
    lastMCRUpdateTime = block.timestamp;
  }

  /* ====== NOT NEEDED FUNCTIONS ====== */

  function mcr() external override pure returns (uint80) {
    revert("Unsupported");
  }

  function desiredMCR() external override pure returns (uint80) {
    revert("Unsupported");
  }

  function lastUpdateTime() external override pure returns (uint32) {
    revert("Unsupported");
  }

  function gearingFactor() external pure returns (uint24) {
    revert("Unsupported");
  }

  function maxMCRIncrement() external pure returns (uint16) {
    revert("Unsupported");
  }

  function minUpdateTime() external pure returns (uint16) {
    revert("Unsupported");
  }
}
