
pragma solidity 0.5.7;

import "./MCR.sol";
import "./PoolData.sol";


contract PoolDataMock is PoolData {

	function changeCurrencyAssetBaseMin(bytes4 curr, uint baseMin) external {
	    allCurrencyAssets[curr].baseMin = baseMin;
	}
}
