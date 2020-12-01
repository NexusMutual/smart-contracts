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

import "../../modules/token/NXMToken.sol";

contract Pool1Interface {
  function sellNXM(uint nxmAmount, uint minEthOut) public;
}

contract P1MockMember {

  Pool1Interface pool1;
  NXMToken token;
  address tokenControllerAddress;

  constructor(address pool1Address, address tokenAddress, address _tokenControllerAddress) public {
    pool1 = Pool1Interface(pool1Address);
    token = NXMToken(tokenAddress);
    tokenControllerAddress = _tokenControllerAddress;
  }

  function sellNXM(uint amount) public {
    token.approve(tokenControllerAddress, amount);
    pool1.sellNXM(amount, 0);
  }

  function() payable external {
    revert('I secretly hate ether');
  }
}
