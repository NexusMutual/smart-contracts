// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/TokenControllerGeneric.sol";

contract GVMockTokenController is TokenControllerGeneric {

  mapping(address => uint) internal lockedUserTokens;
  mapping(address => uint) internal totalTokenAmount;
  uint internal _totalSupply;

  function totalBalanceOf(address member) external override view returns (uint) {
    return totalTokenAmount[member];
  }

  function setTotalBalanceOf(address member, uint amount) external {
    totalTokenAmount[member] = amount;
  }

  function totalSupply() external override view returns (uint) {
    return _totalSupply;
  }

  function setTotalSupply(uint amount) external {
    _totalSupply = amount;
  }

  function lockForMemberVote(address _of, uint duration) external override {
    lockedUserTokens[_of] = block.timestamp + duration;
  }

  event ExampleFunctionXCalledWith(uint value);
  event ExampleFunctionYCalledWith(uint msgValue, bool flag);

  function exampleFunctionX(uint value) external {
    emit ExampleFunctionXCalledWith(value);
  }

  function exampleFunctionY(bool flag) external payable {
    emit ExampleFunctionYCalledWith(msg.value, flag);
  }

}
