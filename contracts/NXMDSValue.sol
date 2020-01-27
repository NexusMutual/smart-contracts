/* Copyright (C) 2020 NexusMutual.io

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

pragma solidity 0.5.7;


contract Aggregator {
    function currentAnswer() public view returns (uint); 
}


contract NXMDSValue {

    /// @dev Gets DAI feed address from chainlink feed and converts into desired format.
    /// @return It return DAI Feed rate in 10^18 format.  
    function read() public view returns (bytes32)
    {
        
        // Instance to get DAI feed from chainlink feed.
        Aggregator aggregator = Aggregator(0x79fEbF6B9F76853EDBcBc913e6aAE8232cFB9De9);
        
        // Chainlink feed returns value = rate * 10^8.
        // Multiplying value by 10^10 since we need value = rate * 10^18 format to follow the DSValue format.
        // Chainlink feed returns  uint, converting to bytes32 to follow the DSValue format.
        return bytes32(aggregator.currentAnswer()*10**10);
    }
}