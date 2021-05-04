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

pragma solidity ^0.5.17;

import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";

contract P1MockLido is ERC20Mintable, ERC20Detailed {

  uint public ethToStETHRate = 10000;

  constructor() ERC20Detailed("Lido", "LIDO", 18) public {
    /* noop */
  }

  // fallback
  function() external payable {
    // protection against accidental submissions by calling non-existent function
    require(msg.data.length == 0, "NON_EMPTY_DATA");
    _mint(msg.sender, msg.value * ethToStETHRate / 10000);
  }

  function setETHToStETHRate(uint _ethToStETHRate) public {
    ethToStETHRate = _ethToStETHRate;
  }
}
