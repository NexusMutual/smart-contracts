// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/PriceFeedOracleGeneric.sol";

contract MCRMockPriceFeedOracle is PriceFeedOracleGeneric {

    address public daiAddress;
    uint public daiToEthRate;

    constructor(address _daiAddress, uint _daiToEthRate) {
        daiAddress = _daiAddress;
        daiToEthRate = _daiToEthRate;
    }

    function getAssetToEthRate(address asset) external override view returns (uint) {
        require(asset == daiAddress);
        return daiToEthRate;
    }
}
