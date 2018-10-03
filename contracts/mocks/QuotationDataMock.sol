pragma solidity ^0.4.24;

import "../QuotationData.sol";

contract QuotationDataMock is QuotationData {

	constructor() public QuotationData() {
		  
	}
	
	function changeHoldedCoverDetails (uint index, uint[] newcoverDetails) public {
		allCoverHolded[index].coverDetails = newcoverDetails;
	}

	function changeHoldedCoverPeriod (uint index, uint16 newCoverPeriod) public {
		allCoverHolded[index].coverPeriod = newCoverPeriod;
	}


	function changeHoldedCoverCurrency (uint index, bytes4 newCurr) public {
		allCoverHolded[index].coverCurr = newCurr;
	}

	/// @dev Change the Product Name of a given cover.
	function changeProductNameOfCover(uint _cid, bytes8 newProductName) public {
        allCovers[_cid].productName = newProductName;
    }

}