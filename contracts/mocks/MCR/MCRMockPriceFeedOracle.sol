// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../modules/oracles/PriceFeedOracle.sol";

contract MCRMockPriceFeedOracle {
    using SafeMath for uint;

    address public daiAddress;
    uint public daiToEthRate;

    constructor(address _daiAddress, uint _daiToEthRate) public{
        daiAddress = _daiAddress;
        daiToEthRate = _daiToEthRate;
    }

    function getAssetToEthRate(address asset) public view returns (uint) {
        require(asset == daiAddress);
        return daiToEthRate;
    }
}
