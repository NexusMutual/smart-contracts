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

pragma solidity ^0.5.17;

import "../../modules/oracles/PriceFeedOracle.sol";
import "./MCRMockPriceFeedOracle.sol";

contract MCRMockPool {
    using SafeMath for uint;

    uint public constant MCR_RATIO_DECIMALS = 4;
    PriceFeedOracle public priceFeedOracle;
    uint poolValueInEth;

    constructor(address _priceFeedOracle) public {
        priceFeedOracle = PriceFeedOracle(_priceFeedOracle);
    }

    function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public pure returns (uint) {
        return totalAssetValue.mul(10 ** MCR_RATIO_DECIMALS).div(mcrEth);
    }

    function getPoolValueInEth() public view returns (uint) {
        return poolValueInEth;
    }

    function setPoolValueInEth(uint value) public {
        poolValueInEth = value;
    }
}
