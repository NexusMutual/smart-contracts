// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../modules/token/external/ERC20.sol";
import "../../interfaces/INXMToken.sol";

contract NXMTokenMock is INXMToken, ERC20 {

  mapping(address => bool) public whiteListed;
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
    require(isLockedForMV[from] < block.timestamp, "Member should not be locked for member voting");
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

  function addToWhiteList(address member) external returns (bool) {
    whiteListed[member] = true;
    return true;
  }

  function removeFromWhiteList(address member) external returns (bool) {
    whiteListed[member] = false;
    return true;
  }

  function changeOperator(address _newOperator) external returns (bool) {
    operator = _newOperator;
    return true;
  }

  function lockForMemberVote(address _member, uint lockTime) external {
    isLockedForMV[_member] = block.timestamp + lockTime;
  }
}
