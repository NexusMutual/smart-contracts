// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

contract CoverMockQuotationData {

  mapping(bytes4 => uint) public sumAssuredByCurrency;

  enum HCIDStatus {NA, kycPending, kycPass, kycFailedOrRefunded, kycPassNoCover}

  enum CoverStatus {Active, ClaimAccepted, ClaimDenied, CoverExpired, ClaimSubmitted, Requested}

  struct Cover {
    address payable memberAddress;
    bytes4 currencyCode;
    uint sumAssured;
    uint16 coverPeriod;
    uint validUntil;
    address scAddress;
    uint premiumNXM;
  }

  address public authQuoteEngine;

  mapping(bytes4 => uint) internal currencyCSA;
  mapping(address => uint[]) internal userCover;
  mapping(uint => uint8) public coverStatus;

  Cover[] internal allCovers;

  function addCover(
    uint16 _coverPeriod,
    uint _sumAssured,
    address payable _userAddress,
    bytes4 _currencyCode,
    address _scAddress,
    uint /*premium*/,
    uint premiumNXM
  ) external {
    uint expiryDate = block.timestamp + uint(_coverPeriod) * 1 days;
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
    uint coverId = allCovers.length - 1;
    userCover[_userAddress].push(coverId);
  }

  /// @dev Gets the Total Sum Assured amount of a given currency.
  function setTotalSumAssured(bytes4 currency, uint amount) public {
      sumAssuredByCurrency[currency] = amount;
  }

  /// @dev Gets the status of a given cover.
  function getCoverStatusNo(uint _cid) external view returns (uint8) {
    return coverStatus[_cid];
  }

  /// @dev Changes the status of a given cover.
  function changeCoverStatusNo(uint _cid, uint8 _stat) public {
    coverStatus[_cid] = _stat;
  }

  /// @dev Provides the details of a cover Id
  function getCoverDetailsByCoverID1(
    uint _cid
  )
  external
  view
  returns (
    uint cid,
    address _memberAddress,
    address _scAddress,
    bytes4 _currencyCode,
    uint _sumAssured,
    uint premiumNXM
  )
  {
    return (
    _cid,
    allCovers[_cid].memberAddress,
    allCovers[_cid].scAddress,
    allCovers[_cid].currencyCode,
    allCovers[_cid].sumAssured,
    allCovers[_cid].premiumNXM
    );
  }

  /// @dev Provides details of a cover Id
  function getCoverDetailsByCoverID2(
    uint _cid
  )
  external
  view
  returns (
    uint cid,
    uint8 status,
    uint sumAssured,
    uint16 coverPeriod,
    uint validUntil
  )
  {

    return (
    _cid,
    coverStatus[_cid],
    allCovers[_cid].sumAssured,
    allCovers[_cid].coverPeriod,
    allCovers[_cid].validUntil
    );
  }
}
