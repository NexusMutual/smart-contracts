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
    function currentAnswer() public view returns (int); 
}


contract NXMDSValue {

    using SafeMath for uint;

    /// @dev Get ETH-USD feed from Chainlink and convert it to bytes32.
    /// @return Returns ETH-USD rate in wei. 
    function read() public view returns (bytes32)
    {
        
        // Instance to get USD feed from chainlink.
        Aggregator aggregator = Aggregator(0x79fEbF6B9F76853EDBcBc913e6aAE8232cFB9De9);
        int rate = aggregator.currentAnswer();

        // Chainlink returns value of type int256, 
        // Check is to ensure that value should always be positive integer. 
        require(rate > 0, "Rate should be positive integer only"); 
        
        // Chainlink feed return value is (rate * 10^8).
        // Multiplying by 10^10 because DSValue requires the value to be in format (rate * 10^18).
        // Chainlink feed returns int256. Converting to bytes32 to follow the DSValue format.
        return bytes32(uint(rate).mul(10**10));
    }
}
