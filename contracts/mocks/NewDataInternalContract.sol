pragma solidity 0.5.7;

import "../NXMaster.sol";
import "../Iupgradable.sol";

contract NewDataInternalContract is Iupgradable {

	
    function callUpdatePauseTime(uint _val) public {
    	ms.updatePauseTime(_val);
    }

    function changeDependentContractAddress() public onlyInternal {
        
    }
}