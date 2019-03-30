pragma solidity 0.4.24;

import "../PoolData.sol";
import "../Governance.sol";


contract GovernanceMock is Governance {

    function changeCurrencyAssetBaseMin(bytes4 curr, uint baseMin) external {
        PoolData pd = PoolData(ms.getLatestAddress("PD"));
        pd.changeCurrencyAssetBaseMin(curr, baseMin);
    }
}
