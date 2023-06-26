// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

contract CapitalPool {

  uint public daiBalance;
  uint public daiRate = 1 ether / 2000;
  uint public mcr;

  constructor (uint _daiBalance, uint _daiRate, uint _mcr) payable {
    daiBalance = _daiBalance;
    daiRate = _daiRate;
    mcr = _mcr;
  }

  function setDaiRate(uint _daiRate) external {
    daiRate = _daiRate;
  }

  function sendEth(address payable to, uint amount) external {
    (bool ok,) = to.call{value: amount}("");
    require(ok, "CapitalPool: payout failed");
  }

  function getPoolValueInEth() external view returns (uint) {
    uint balance = address(this).balance;
    uint daiValue = daiBalance * daiRate / 1 ether;
    return balance + daiValue;
  }

  receive() external payable {
    // money? yes, thank you
  }

}
