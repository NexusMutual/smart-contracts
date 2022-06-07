// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../modules/legacy/LegacyQuotationData.sol";

contract TestnetQuotationData is LegacyQuotationData {

  constructor(
    address _authQuoteAdd,
    address _kycAuthAdd
  ) LegacyQuotationData(_authQuoteAdd, _kycAuthAdd) public {
    /* noop */
  }

  function addOldCover(
    uint startDate,
    uint16 coverPeriod,
    uint sumAssured,
    address payable userAddress,
    bytes4 currencyCode,
    address scAddress,
    uint /*premium*/,
    uint premiumNXM
  ) external {
    uint start = startDate == 0 ? now : startDate;
    uint expiryDate = start.add(uint(coverPeriod).mul(1 days));
    allCovers.push(Cover(userAddress, currencyCode,
      sumAssured, coverPeriod, expiryDate, scAddress, premiumNXM));
    uint cid = allCovers.length.sub(1);
    userCover[userAddress].push(cid);
    emit CoverDetailsEvent(cid, scAddress, sumAssured, expiryDate, 123e16, 123e18, currencyCode);
  }
}
