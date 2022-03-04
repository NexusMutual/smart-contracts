// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

interface IWeth {
  function deposit() external payable;

  function withdraw(uint256 wad) external;
}
