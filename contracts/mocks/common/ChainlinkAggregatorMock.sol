// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

contract ChainlinkAggregatorMock {
  uint public latestAnswer;
  uint public decimals;
  uint80 public _roundId;

  function setDecimals(uint _decimals) public {
    decimals = _decimals;
  }

  function setLatestAnswer(uint _latestAnswer) public {
    latestAnswer = _latestAnswer;
  }

  function latestRoundData()
    public view
    returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
  {
    return (_roundId, int256(latestAnswer), block.timestamp, block.timestamp, _roundId);
  }
}
