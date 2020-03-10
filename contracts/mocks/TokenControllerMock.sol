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

  function lock(bytes32 _reason, uint256 _amount, uint256 _time) public returns (bool);

  function tokensLocked(address _of, bytes32 _reason) public view returns (uint256 amount);

  function tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time) public view returns (uint256 amount);

  function totalBalanceOf(address _of) public view returns (uint256 amount);

  function extendLock(bytes32 _reason, uint256 _time) public returns (bool);

  function increaseLockAmount(bytes32 _reason, uint256 _amount) public returns (bool);

  function tokensUnlockable(address _of, bytes32 _reason) public view returns (uint256 amount);

  function unlock(address _of) public returns (uint256 unlockableTokens);

  function getUnlockableTokens(address _of) public view returns (uint256 unlockableTokens);

}
