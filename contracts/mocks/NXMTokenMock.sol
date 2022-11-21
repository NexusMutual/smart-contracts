// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/INXMToken.sol";

contract NXMTokenMock is INXMToken, ERC20 {

  mapping(address => uint) public isLockedForMV;
  address public operator;

  function setLock(address _member, uint lockTime) public {
    isLockedForMV[_member] = block.timestamp + lockTime;
  }

  function setOperator(address _operator) public {
    operator = _operator;
  }

  function operatorTransfer(address from, uint256 amount) public returns (bool) {
    require(msg.sender == operator, "Only operator can call operatorTransfer");
    _approve(from, msg.sender, allowance(from, msg.sender).sub(amount, "ERC20: transfer amount exceeds allowance"));
    _transfer(from, operator, amount);
    return true;
  }

  function transfer(address to, uint256 amount) public returns (bool) {
    require(isLockedForMV[msg.sender] < block.timestamp, "Member should not be locked for member voting");
    _transfer(msg.sender, to, amount);
    return true;
  }

  function transferFrom(address from, address to, uint256 amount) public returns (bool) {
    require(isLockedForMV[msg.sender] < block.timestamp, "Member should not be locked for member voting");
    _approve(from, msg.sender, allowance(from, msg.sender).sub(amount, "ERC20: transfer amount exceeds allowance"));
    _transfer(from, to, amount);
    return true;
  }

  // not public in actual implementation
  function mint(address account, uint256 amount) public {
    _mint(account, amount);
  }

  function burn(uint256 amount) public returns (bool) {
    _burn(msg.sender, amount);
    return true;
  }

  function burnFrom(address from, uint256 value) public returns (bool) {
    _burnFrom(from, value);
    return true;
  }

  function addToWhiteList(address /*_member*/) external returns (bool) {
    // noop
  }

  function removeFromWhiteList(address /*_member*/) external returns (bool) {
    // noop
  }

  function changeOperator(address /*_newOperator*/) external returns (bool) {
    // noop
  }

  function lockForMemberVote(address /*_of*/, uint /*_days*/) external {
    // noop
  }
}
