// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

interface IRETH {
  function getExchangeRate() external view returns (uint256);
}

contract AggregatorRETH {

  uint8 public decimals = 18;
  IRETH public immutable rETH;

  constructor(address _rETH) {
    rETH = IRETH(_rETH);
  }

  function latestAnswer() public view returns (uint256) {
    return rETH.getExchangeRate();
  }

}
