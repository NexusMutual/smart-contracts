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
import "./external/openzeppelin-solidity/math/SafeMath.sol";


contract Aggregator {
    function latestAnswer() public view returns (int); 
}


contract NXMDSValue {

    using SafeMath for uint;

    /// @dev Get DAI-ETH feed from Chainlink and convert it to ETH-DAI(in bytes32).
    /// @return Return ETH-DAI rate in wei. 
    function read() public view returns (bytes32)
    {
        
        // Instance to get DAI-ETH feed from chainlink.
        Aggregator aggregator = Aggregator(0x037E8F2125bF532F3e228991e051c8A7253B642c);
        int rate = aggregator.latestAnswer();

        // Chainlink returns an int256. Ensure the value is always positive. 
        require(rate > 0, "Rate should be a positive integer"); 
        
        // Reciprocating the obtained value because DSValue requires the value to be in format (ETH-DAI).
        // Convert value to bytes32 to follow the DSValue format.
        return bytes32(uint(10**36).div(uint(rate)));
    }
}
