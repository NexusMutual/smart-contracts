// SPDX-License-Identifier: GPL-3.0-only

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
