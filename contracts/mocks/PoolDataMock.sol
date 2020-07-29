
pragma solidity 0.5.7;

import "../modules/capital/MCR.sol";
import "../modules/capital/PoolData.sol";


contract PoolDataMock is PoolData {

    constructor(address _notariseAdd, address _daiFeedAdd, address _daiAdd) public 
    PoolData(_notariseAdd, _daiFeedAdd, _daiAdd) {
    	uint DECIMAL1E18 = 10 ** 18;
    	notariseMCR = _notariseAdd;
        daiFeedAddress = _daiFeedAdd;
        c = 5203349;
        a = 1948;
        mcrTime = 24 hours;
        mcrFailTime = 6 hours;
        minCap = 7;
        shockParameter = 50;
        variationPercX100 = 100; //1%
        iaRatesTime = 24 hours; //24 hours in seconds
        uniswapDeadline = 20 minutes;
        liquidityTradeCallbackTime = 4 hours;
        ethVolumeLimit = 4;
        capacityLimit = 10;
        allCurrencyAssets["ETH"] = CurrencyAssets(address(0), 6 * DECIMAL1E18, 0);
        allCurrencyAssets["DAI"] = CurrencyAssets(_daiAdd, 7 * DECIMAL1E18, 0);
        allInvestmentAssets["ETH"] = InvestmentAssets(address(0), true, 500, 5000, 18);
        allInvestmentAssets["DAI"] = InvestmentAssets(_daiAdd, true, 500, 5000, 18);
    }

    function changeCurrencyAssetBaseMin(bytes4 curr, uint baseMin) external {
        allCurrencyAssets[curr].baseMin = baseMin;
    }
}
