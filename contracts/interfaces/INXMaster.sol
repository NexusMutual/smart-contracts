// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

interface INXMMaster {
  function getLatestAddress(bytes2 _contractName) external view returns (address payable contractAddress);
}
