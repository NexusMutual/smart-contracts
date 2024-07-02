// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/INXMToken.sol";
import "../../generic/TokenControllerGeneric.sol";

contract ASMockTokenController is TokenControllerGeneric {

  address public addToWhitelistLastCalledWith;

  constructor(address tokenAddres) {
    token = INXMToken(tokenAddres);
  }

  function operatorTransfer(address _from, address _to, uint _value) override external returns (bool) {
    token.operatorTransfer(_from, _value);
    token.transfer(_to, _value);
    return true;
  }

  function mint(address _to, uint _value) override external {
    token.mint(_to, _value);
  }

  function addToWhitelist(address _member) override public {
    addToWhitelistLastCalledWith = _member;
  }
}
