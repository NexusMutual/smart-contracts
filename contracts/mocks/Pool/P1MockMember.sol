// SPDX-License-Identifier: GPL-3.0-only

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
