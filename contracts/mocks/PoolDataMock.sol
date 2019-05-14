
pragma solidity 0.5.7;

import "../MCR.sol";
import "../PoolData.sol";


contract PoolDataMock is PoolData {

    constructor(address _notariseAdd, address _daiFeedAdd, address _daiAdd) public 
    PoolData(_notariseAdd, _daiFeedAdd, _daiAdd) {
    }

    function changeCurrencyAssetBaseMin(bytes4 curr, uint baseMin) external {
        allCurrencyAssets[curr].baseMin = baseMin;
    }
}
