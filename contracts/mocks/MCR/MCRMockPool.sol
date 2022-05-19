// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";

contract MCRMockPool {

    uint public constant MCR_RATIO_DECIMALS = 4;
    IPriceFeedOracle public priceFeedOracle;
    uint poolValueInEth;

    IPool.Asset[] public coverAssets;

    constructor(address _priceFeedOracle) public {
        priceFeedOracle = IPriceFeedOracle(_priceFeedOracle);
    }

    function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public pure returns (uint) {
        return totalAssetValue * (10 ** MCR_RATIO_DECIMALS) / mcrEth;
    }

    function getPoolValueInEth() public view returns (uint) {
        return poolValueInEth;
    }

    function setPoolValueInEth(uint value) public {
        poolValueInEth = value;
    }

    function getCoverAssets() external view returns (IPool.Asset[] memory) {
      return coverAssets;
    }

    function addCoverAsset(address assetAddress, uint8 decimals) external {
      coverAssets.push(IPool.Asset(assetAddress, decimals));
    }
}
