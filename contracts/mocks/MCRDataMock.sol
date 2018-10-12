pragma solidity ^0.4.24;

import "../MCRData.sol";

contract MCRDataMock is MCRData {

    constructor() public MCRData() {
     
    }
	
    function removeAllCurrencies() public {
        delete allCurrencies;
    }

    function removeAllMCRData() public {
        delete allMCRData;
    }

}