/* Copyright (C) 2021 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity >=0.5.0;

interface IQuotationData {

  function stlp() external view returns (uint);
  function stl() external view returns (uint);
  function pm() external view returns (uint);
  function minDays() external view returns (uint);
  function tokensRetained() external view returns (uint);
  function kycAuthAddress() external view returns (address);

  function refundEligible(address) external view returns (bool);
  function holdedCoverIDStatus(uint) external view returns (uint);
  function timestampRepeated(uint) external view returns (bool);

  enum HCIDStatus {NA, kycPending, kycPass, kycFailedOrRefunded, kycPassNoCover}
  enum CoverStatus {Active, ClaimAccepted, ClaimDenied, CoverExpired, ClaimSubmitted, Requested}

  function addInTotalSumAssuredSC(address _add, bytes4 _curr, uint _amount) external;

  function subFromTotalSumAssuredSC(address _add, bytes4 _curr, uint _amount) external;

  function subFromTotalSumAssured(bytes4 _curr, uint _amount) external;

  function addInTotalSumAssured(bytes4 _curr, uint _amount) external;

  function setTimestampRepeated(uint _timestamp) external;

  /// @dev Creates a blank new cover.
  function addCover(
    uint16 _coverPeriod,
    uint _sumAssured,
    address payable _userAddress,
    bytes4 _currencyCode,
    address _scAddress,
    uint premium,
    uint premiumNXM
  ) external;


  function addHoldCover(
    address payable from,
    address scAddress,
    bytes4 coverCurr,
    uint[] calldata coverDetails,
    uint16 coverPeriod
  ) external;

  function setRefundEligible(address _add, bool status) external;

  function setHoldedCoverIDStatus(uint holdedCoverID, uint status) external;

  function setKycAuthAddress(address _add) external;

  function changeAuthQuoteEngine(address _add) external;

  function getUintParameters(bytes8 code) external view returns (bytes8 codeVal, uint val);

  function getProductDetails()
  external
  view
  returns (
    uint _minDays,
    uint _pm,
    uint _stl,
    uint _stlp
  );

  function getCoverLength() external view returns (uint len);

  function getAuthQuoteEngine() external view returns (address _add);

  function getTotalSumAssured(bytes4 _curr) external view returns (uint amount);

  function getAllCoversOfUser(address _add) external view returns (uint[] memory allCover);

  function getUserCoverLength(address _add) external view returns (uint len);

  function getCoverStatusNo(uint _cid) external view returns (uint8);

  function getCoverPeriod(uint _cid) external view returns (uint32 cp);

  function getCoverSumAssured(uint _cid) external view returns (uint sa);

  function getCurrencyOfCover(uint _cid) external view returns (bytes4 curr);

  function getValidityOfCover(uint _cid) external view returns (uint date);

  function getscAddressOfCover(uint _cid) external view returns (uint, address);

  function getCoverMemberAddress(uint _cid) external view returns (address payable _add);

  function getCoverPremiumNXM(uint _cid) external view returns (uint _premiumNXM);

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
  );

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
  );

  function getHoldedCoverDetailsByID1(
    uint _hcid
  )
  external
  view
  returns (
    uint hcid,
    address scAddress,
    bytes4 coverCurr,
    uint16 coverPeriod
  );

  function getUserHoldedCoverLength(address _add) external view returns (uint);

  function getUserHoldedCoverByIndex(address _add, uint index) external view returns (uint);

  function getHoldedCoverDetailsByID2(
    uint _hcid
  )
  external
  view
  returns (
    uint hcid,
    address payable memberAddress,
    uint[] memory coverDetails
  );

  function getTotalSumAssuredSC(address _add, bytes4 _curr) external view returns (uint amount);

  function changeCoverStatusNo(uint _cid, uint8 _stat) external;

}
