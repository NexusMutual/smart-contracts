// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

contract MCRMockPriceFeedOracle {

    address public daiAddress;
    uint public daiToEthRate;

    constructor(address _daiAddress, uint _daiToEthRate) {
        daiAddress = _daiAddress;
        daiToEthRate = _daiToEthRate;
    }

    function getAssetToEthRate(address asset) public view returns (uint) {
        require(asset == daiAddress);
        return daiToEthRate;
    }
}
