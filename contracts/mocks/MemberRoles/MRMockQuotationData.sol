// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

contract MRMockQuotationData {
  address public kycAuthAddress;

  function setKycAuthAddress(address _add) external {
    kycAuthAddress = _add;
  }
}
