// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

contract ChainlinkAggregatorMock {

  uint public latestAnswer;
  uint public decimals;

  function setDecimals(uint _decimals) public {
    decimals = _decimals;
  }

  function setLatestAnswer(uint _latestAnswer) public {
    latestAnswer = _latestAnswer;
  }

}
