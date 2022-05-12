// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../abstract/MasterAware.sol";
import "../modules/token/NXMToken.sol";

contract TokenControllerMock is MasterAware {

  NXMToken public token;

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

  function removeFromWhitelist(address _member) public view onlyInternal {
    // noop
    _member;
  }

  function changeDependentContractAddress() public {
    token = NXMToken(master.tokenAddress());
  }

  function operatorTransfer(address _from, address _to, uint _value) onlyInternal external returns (bool) {
    require(msg.sender == master.getLatestAddress("PS") || msg.sender == master.getLatestAddress("CO"),
      "Call is only allowed from PooledStaking or Cover address");
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
