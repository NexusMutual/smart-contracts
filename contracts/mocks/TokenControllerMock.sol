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

pragma solidity ^0.5.16;

import "../interfaces/IERC1132.sol";

contract TokenControllerMock is IERC1132 {

  bool lockShouldFail;
  mapping(address => uint) locked;

  /* utils */

  function setLockShouldFail(bool shouldFail) public {
    lockShouldFail = shouldFail;
  }

  /* mocked implementations */

  function lockOf(address _of, bytes32 _reason, uint256 _amount, uint256 _time) public returns (bool) {

    require(_reason == "PS", "Lock reason should be PS (pooled staking)");

    if (lockShouldFail) {
      // trigger underflow
      uint a = 0;
      a.sub(1);
    }

    emit Locked(_of, _reason, _amount, now.add(_time));
    return true;
  }

  function increaseLockAmount(bytes32 _reason, uint256 _amount) public returns (bool) {

    // increaseLockAmountOf is missing
    // reduce then lock new amount?

    revert('Not implemented');
  }

  /* unused functions */

  modifier unused {
    revert("Unexpected MasterMock call");
    _;
  }

  function tokensLocked(address _of, bytes32 _reason) unused public view returns (uint256) {}

  function tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time) unused public view returns (uint256) {}

  function totalBalanceOf(address _of) unused public view returns (uint256) {}

  function extendLock(bytes32 _reason, uint256 _time) unused public returns (bool) {}

  function increaseLockAmount(bytes32 _reason, uint256 _amount) unused public returns (bool) {}

  function tokensUnlockable(address _of, bytes32 _reason) unused public view returns (uint256) {}

  function unlock(address _of) unused public returns (uint256) {}

  function getUnlockableTokens(address _of) unused public view returns (uint256) {}
}
