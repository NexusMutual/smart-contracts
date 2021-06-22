// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

contract ChainlinkAggregatorMock {

  uint latestAnswerRate;

  function setLatestAnswer(uint rate) public {
    latestAnswerRate = rate;
  }

  function latestAnswer() public view returns (int) {
    return int(latestAnswerRate);
  }
}
