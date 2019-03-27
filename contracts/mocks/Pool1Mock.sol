pragma solidity 0.4.24;

import "../Pool1.sol";

contract Pool1Mock is Pool1 {

	function _oraclizeQuery(
        uint paramCount,
        uint timestamp,
        string datasource,
        string arg,
        uint gasLimit
    ) 
        internal
        
        returns (bytes32)
    {
        // To silence compiler warning :(
       return bytes32(keccak256(
            abi.encodePacked(
                paramCount,
                timestamp,
                datasource,
                arg,
                gasLimit
            )
        ));
    }

    function transferFundToOtherAdd(address _add,uint amt) public {

        _add.transfer(amt);
        
    }

    function upgradeCapitalPool(address newPoolAddress) external  {
        for (uint64 i = 1; i < pd.getAllCurrenciesLen(); i++) {
            bytes4 caName = pd.getCurrenciesByIndex(i);
            _upgradeCapitalPool(caName, newPoolAddress);
        }
        if (address(this).balance > 0)
            newPoolAddress.transfer(address(this).balance); //solhint-disable-line
    }

    function upgradeInvestmentPool(address newPoolAddress) public  {
        p2.upgradeInvestmentPool(newPoolAddress);
    }

    function changeCurrencyAssetBaseMin(bytes4 curr, uint baseMin) external {
        pd.changeCurrencyAssetBaseMin(curr, baseMin);
    }

    function internalLiquiditySwap(bytes4 curr) external {
        p2.internalLiquiditySwap(curr);
    }

    function mint(address _to, uint _amount) external {
        tc.mint(_to, _amount);
    }

    function burnFrom(address _from, uint _amount) external {
        tc.burnFrom(_from, _amount);   
    }
    
}
