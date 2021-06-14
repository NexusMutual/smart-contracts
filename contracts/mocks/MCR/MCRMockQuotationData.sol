// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../modules/oracles/PriceFeedOracle.sol";

contract MCRMockQuotationData {
    using SafeMath for uint;

    mapping(bytes4 => uint) public sumAssuredByCurrency;

    /// @dev Gets the Total Sum Assured amount of a given currency.
    function getTotalSumAssured(bytes4 currency) external view returns (uint amount) {
        amount = sumAssuredByCurrency[currency];
    }

    function setTotalSumAssured(bytes4 currency, uint amount) public {
        sumAssuredByCurrency[currency] = amount;
    }
}
