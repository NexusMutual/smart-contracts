// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

interface LegacyMCR {
  function addMCRData(uint mcrP, uint mcrE, uint vF, bytes4[] calldata curr, uint[] calldata _threeDayAvg, uint64 onlyDate) external;
  function addLastMCRData(uint64 date) external;
  function changeDependentContractAddress() external;
  function getAllSumAssurance() external view returns (uint amount);
  function _calVtpAndMCRtp(uint poolBalance) external view returns (uint vtp, uint mcrtp);
  function calculateStepTokenPrice(bytes4 curr, uint mcrtp) external view returns (uint tokenPrice);
  function calculateTokenPrice(bytes4 curr) external view returns (uint tokenPrice);
  function calVtpAndMCRtp() external view returns (uint vtp, uint mcrtp);
  function calculateVtpAndMCRtp(uint poolBalance) external view returns (uint vtp, uint mcrtp);
  function getThresholdValues(uint vtp, uint vF, uint totalSA, uint minCap) external view returns (uint lowerThreshold, uint upperThreshold);
  function getMaxSellTokens() external view returns (uint maxTokens);
  function getUintParameters(bytes8 code) external view returns (bytes8 codeVal, uint val);
  function updateUintParameters(bytes8 code, uint val) external;

  function variableMincap() external view returns (uint);
  function dynamicMincapThresholdx100() external view returns (uint);
  function dynamicMincapIncrementx100() external view returns (uint);

  function getLastMCREther() external view returns (uint);
}
