// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMCR {

  function updateMCRInternal(uint poolValueInEth, bool forceUpdate) external;
  function getMCR() external view returns (uint);


  function maxMCRFloorIncrement() external returns (uint24);

  function mcrFloor() external returns (uint112);
  function mcr() external returns (uint112);
  function desiredMCR() external returns (uint112);
  function lastUpdateTime() external returns (uint32);
}
