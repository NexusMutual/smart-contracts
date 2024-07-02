// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/QuotationDataGeneric.sol";

contract MRMockQuotationData is QuotationDataGeneric {
  address public _kycAuthAddress;

  function setKycAuthAddress(address _add) external override {
    _kycAuthAddress = _add;
  }

  function kycAuthAddress() external override view returns (address) {
    return _kycAuthAddress;
  }
}
