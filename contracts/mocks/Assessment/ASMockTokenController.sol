// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../interfaces/INXMToken.sol";

contract ASMockTokenController {

  INXMToken public token;

  address public addToWhitelistLastCalledWith;
  address public removeFromWhitelistLastCalledWith;

  constructor(address tokenAddres) public {
    token = INXMToken(tokenAddres);
  }

  function operatorTransfer(address _from, address _to, uint _value) external returns (bool) {
    token.operatorTransfer(_from, _value);
    token.transfer(_to, _value);
  }

  function mint(address _to, uint _value) external returns (bool) {
    token.mint(_to, _value);
  }

  function addToWhitelist(address _member) public {
    addToWhitelistLastCalledWith = _member;
  }
}
