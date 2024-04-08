// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../modules/legacy/LegacyQuotationData.sol";

contract TestnetQuotationData is LegacyQuotationData {

  constructor (
    address _authQuoteAdd,
    address _kycAuthAdd
  ) LegacyQuotationData(_authQuoteAdd, _kycAuthAdd) public {
    // noop
  }

  /// @dev Creates a blank new cover.
  function addV1Cover(
    uint16 _coverPeriod,
    uint _sumAssured,
    address payable _userAddress,
    bytes4 _currencyCode,
    address _scAddress,
    uint premium,
    uint premiumNXM
  ) external {
    uint expiryDate = now.add(uint(_coverPeriod).mul(1 days));

    allCovers.push(
      Cover(
        _userAddress,
        _currencyCode,
        _sumAssured,
        _coverPeriod,
        expiryDate,
        _scAddress,
        premiumNXM
      )
    );

    uint cid = allCovers.length.sub(1);
    userCover[_userAddress].push(cid);

    emit CoverDetailsEvent(cid, _scAddress, _sumAssured, expiryDate, premium, premiumNXM, _currencyCode);
  }

}
