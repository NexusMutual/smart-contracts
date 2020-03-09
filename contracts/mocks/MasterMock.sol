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

import "../interfaces/INXMMaster.sol";

contract MasterMock {

  enum Role {
    NonMember,
    Member,
    AdvisoryBord,
    Owner
  }

  mapping(address => Role) members;
  address internalAddress;
  address governedAddress;

  function enrollMember(address member, Role role) public {
    members[member] = role;
  }

  function checkIsAuthToGoverned(address caller) public view returns (bool) {
    return governedAddress == caller;
  }

  function isInternal(address caller) public view returns (bool) {
    return internalAddress == caller;
  }

  function isMember(address caller) public view returns (bool) {
    return members[caller] >= Role.Member;
  }
}
