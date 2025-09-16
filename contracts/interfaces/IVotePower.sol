// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

interface IVotePower {

  function name() external view returns (string memory);
  function symbol() external view returns (string memory);
  function decimals() external view returns (uint8);

  function balanceOf(address member) external view returns (uint);
  function totalSupply() external view returns (uint);

}
