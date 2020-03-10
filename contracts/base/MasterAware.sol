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

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "../interfaces/INXMMaster.sol";

contract MasterAware is Initializable {

  INXMMaster internal master;

  modifier onlyInternal {
    require(master.isInternal(msg.sender), "Caller is not an internal contract");
    _;
  }

  modifier onlyMembers {
    require(master.isMember(msg.sender), "Caller is not a member");
    _;
  }

  modifier onlyGoverned {
    require(
      master.checkIsAuthToGoverned(msg.sender),
      "Caller is not authorized to govern"
    );
    _;
  }

  function initialize(address masterAddress) public {
    master = INXMMaster(masterAddress);
  }
}
