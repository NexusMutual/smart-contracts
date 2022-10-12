// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMCR {

  function updateMCRInternal(uint poolValueInEth, bool forceUpdate) external;

  function getMCR() external view returns (uint);

  function mcr() external view returns (uint112);

  function mcrFloor() external view returns (uint112);

  function desiredMCR() external view returns (uint112);

  function lastUpdateTime() external view returns (uint32);

  function mcrFloorIncrementThreshold() external view returns (uint24);

  function maxMCRFloorIncrement() external view returns (uint24);

  function maxMCRIncrement() external view returns (uint24);

  function gearingFactor() external view returns (uint24);

  function minUpdateTime() external view returns (uint24);

}
