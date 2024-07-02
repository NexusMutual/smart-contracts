// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/QuotationDataGeneric.sol";

contract SOMockQuotationData is QuotationDataGeneric {

  function getTotalSumAssured(bytes4) external override pure returns (uint) {
    return 0;
  }

}
