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

import "../abstract/MasterAware.sol";
import "../modules/token/NXMToken.sol";

contract TokenControllerMock is MasterAware {

  NXMToken token;

  function mint(address _member, uint256 _amount) public onlyInternal {
    token.mint(_member, _amount);
  }

  function burnFrom(address _of, uint amount) public onlyInternal returns (bool) {
    return token.burnFrom(_of, amount);
  }

  function addToWhitelist(address _member) public view onlyInternal {
    // noop
    _member;
  }

  function changeDependentContractAddress() public {
    token = NXMToken(master.tokenAddress());
  }

  function operatorTransfer(address _from, address _to, uint _value) onlyInternal external returns (bool) {
    require(msg.sender == master.getLatestAddress("PS"), "Call is only allowed from PooledStaking address");
    require(token.operatorTransfer(_from, _value), "Operator transfer failed");
    require(token.transfer(_to, _value), "Internal transfer failed");
    return true;
  }

  /* unused functions */

  modifier unused {
    require(false, "Unexpected TokenControllerMock call");
    _;
  }

  function burnLockedTokens(address, bytes32, uint256) unused external {}

  function tokensLocked(address, bytes32) unused external view returns (uint256) {}

  function releaseLockedTokens(address _of, bytes32 _reason, uint256 _amount) unused external {}
}
