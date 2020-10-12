/* Copyright (C) 2020 NexusMutual.io

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

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../abstract/Iupgradable.sol";

contract CPQuotationDataMock {
  using SafeMath for uint;

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


  mapping(uint => uint8) public coverStatus;

  Cover[] internal allCovers;

  constructor() public {
    allCovers.push(Cover(address(0), "0x00", 0, 0, 0, address(0), 0));

		// Mock covers
		// CID 1
    allCovers.push(Cover(address(0), "0x00", 0, 30, now.add(30 days), address(0), 0));
		coverStatus[1] = uint8(CoverStatus.Active);

  }

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
