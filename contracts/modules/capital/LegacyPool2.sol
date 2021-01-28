/* Copyright (C) 2020 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.0;

interface LegacyPool2 {
  function uniswapFactoryAddress() external view returns (address);
  function changeUniswapFactoryAddress(address newFactoryAddress) external;
  function upgradeInvestmentPool(address payable newPoolAddress) external;
  function internalLiquiditySwap(bytes4 curr) external;
  function saveIADetails(bytes4[] calldata curr, uint64[] calldata rate, uint64 date, bool bit) external;
  function externalLiquidityTrade() external;
  function changeDependentContractAddress() external;
  function sendEther() external payable;
  function _getCurrencyAssetsBalance(bytes4 _curr) external view returns (uint caBalance);
}
