// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IWeth {
  function deposit() external payable;

  function withdraw(uint256 wad) external;

  function approve(address spender, uint256 value) external;

  function balanceOf(address account) external view returns (uint256);

  function transfer(address recipient, uint256 amount) external returns (bool);
}
