// SPDX-License-Identifier: GPL-3.0

/* Copyright (C) 2021 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity >=0.5.0;


interface ITokenFunctions {

  function getUserAllLockedCNTokens(address _of) external view returns (uint);

  function changeDependentContractAddress() external;

  function burnCAToken(uint claimid, uint _value, address _of) external;

  function isLockedForMemberVote(address _of) external view returns (bool);
}
