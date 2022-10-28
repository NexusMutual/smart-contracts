// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface ISwapOperator {
  function orderInProgress() external returns (bool);
}
