// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/INXMToken.sol";

contract CLMockTokenController {

  INXMToken public token;

  constructor(address tokenAddres) {
    token = INXMToken(tokenAddres);
  }

  function operatorTransfer(address _from, address _to, uint _value) external returns (bool) {
    token.operatorTransfer(_from, _value);
    token.transfer(_to, _value);
    return true;
  }

  function mint(address _to, uint _value) external returns (bool) {
    token.mint(_to, _value);
    return true;
  }

}
