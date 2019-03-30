/* Copyright (C) 2017 NexusMutual.io

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

pragma solidity 0.4.24;


contract INXMMaster {

    address public tokenAddress;

    address public owner;


    uint public pauseTime;

    function delegateCallBack(bytes32 myid) external;
    
    function isInternal(address _add) public view returns(bool);

    function isPause() public view returns(bool check);

    function isOwner(address _add) public view returns(bool);

    function isMember(address _add) public view returns(bool);
    
    function checkIsAuthToGoverned(address _add) public view returns(bool);

    function updatePauseTime(uint _time) public;

    function dAppLocker() public view returns(address _add);

    function dAppToken() public view returns(address _add);

    function getEventCallerAddress() public view returns(address);

    function getLatestAddress(bytes2 _contractName) public view returns(address contractAddress);
}