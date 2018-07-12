/* Copyright (C) 2017 GovBlocks.io

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

/**
 * @title Upgradeable interface for all internal contracts of a DApp.
 */

pragma solidity ^0.4.24;

contract Upgradeable{

	function updateDependencyAddresses() public;

	function changeGBTSAddress(address _GBTSAddress) public;

	function changeMasterAddress(address _MasterAddress) public;
}