pragma solidity 0.4.24;

import "../Pool1.sol";
import "../ClaimsData.sol";


contract Pool1Mock is Pool1 {


    function internalLiquiditySwap(bytes4 curr) external {
        p2.internalLiquiditySwap(curr);
    }

    function mint(address _to, uint _amount) external {
        tc.mint(_to, _amount);
    }

    function burnFrom(address _from, uint _amount) external {
        tc.burnFrom(_from, _amount);   
    }

    function setpendingClaimStart(uint _start) external {
        ClaimsData cd = ClaimsData(ms.getLatestAddress("CD"));
        cd.setpendingClaimStart(_start);
    }

    function updateStakerCommissions(address _scAddress, uint _premiumNXM) external {
        TokenFunctions tf = TokenFunctions(ms.getLatestAddress("TF"));
        tf.updateStakerCommissions(_scAddress, _premiumNXM);
    }

    function burnStakerLockedToken(uint coverid, bytes4 curr, uint sumAssured) external {
        TokenFunctions tf = TokenFunctions(ms.getLatestAddress("TF"));
        tf.burnStakerLockedToken(coverid, curr, sumAssured);
    }

    function depositCN(uint coverId) public {
        TokenFunctions tf = TokenFunctions(ms.getLatestAddress("TF"));
        tf.depositCN(coverId);   
    }

    function transferFundToOtherAdd(address _add, uint amt) public {

        _add.transfer(amt);
        
    }  

    function upgradeInvestmentPool(address newPoolAddress) public {
        p2.upgradeInvestmentPool(newPoolAddress);
    }

    function _oraclizeQuery (
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
                gasLimit,
                now
            )
        ));
    }
}
