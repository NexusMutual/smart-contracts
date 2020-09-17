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

pragma solidity ^0.5.7;

import "../PooledStaking.sol";

contract PooledStakingMock is PooledStaking {

  function initializeMock() public {

    MIN_STAKE = 20 ether;
    MIN_UNSTAKE = 20 ether;
    MAX_EXPOSURE = 10;
    UNSTAKE_LOCK_TIME = 7200;

    REWARD_ROUNDS_START = now;
    REWARD_ROUND_DURATION = 3600;
  }

}
