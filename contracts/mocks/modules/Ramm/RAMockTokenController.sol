// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/INXMToken.sol";
import "../../../interfaces/ITokenController.sol";
import "../../generic/TokenControllerGeneric.sol";

contract RAMockTokenController is TokenControllerGeneric {

  constructor(address tokenAddres) {
    token = INXMToken(tokenAddres);
  }

  function operatorTransfer(address _from, address _to, uint _value) external override returns (bool) {
    token.operatorTransfer(_from, _value);
    token.transfer(_to, _value);
    return true;
  }

  function mint(address _to, uint _value) external override {
    token.mint(_to, _value);
  }

  function burnFrom(address _from, uint _value) external override returns (bool) {
    token.burnFrom(_from, _value);
    return true;
  }

  function totalSupply() public override view returns (uint256) {
    return token.totalSupply();
  }
}
