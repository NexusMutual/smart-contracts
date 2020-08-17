/*
    Copyright (C) 2020 NexusMutual.io

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/
*/

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../abstract/INXMToken.sol";

contract NXMTokenMock is INXMToken, ERC20 {

  mapping(address => bool) public isLockedForMV;
  address public operator;

  function setLock(address _member, bool _lock) public {
    isLockedForMV[_member] = _lock;
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
    require(!isLockedForMV[msg.sender], "Member should not be locked for member voting");
    _transfer(msg.sender, to, amount);
    return true;
  }

  function transferFrom(address from, address to, uint256 amount) public returns (bool) {
    require(!isLockedForMV[from], "Member should not be locked for member voting");
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
}
