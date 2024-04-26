// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/QuotationDataGeneric.sol";

contract MCRMockQuotationData is QuotationDataGeneric {

    mapping(bytes4 => uint) public sumAssuredByCurrency;

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssured(bytes4 currency) external override view returns (uint amount) {
        amount = sumAssuredByCurrency[currency];
    }

    function setTotalSumAssured(bytes4 currency, uint amount) public {
        sumAssuredByCurrency[currency] = amount;
    }
}
