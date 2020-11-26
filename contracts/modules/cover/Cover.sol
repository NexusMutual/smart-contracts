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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../capital/MCR.sol";
import "../capital/Pool1.sol";
import "../capital/PoolData.sol";
import "../governance/MemberRoles.sol";
import "../token/TokenController.sol";
import "../token/TokenData.sol";
import "../capital/PoolData.sol";
import "../token/TokenFunctions.sol";
import "./QuotationData.sol";

contract Cover is MasterAware, Iupgradable {
  // contracts
  Quotation public quotation;
  NXMToken public nxmToken;
  TokenController public tokenController;
  MCR public mcr;

  function buyCover (
    address contractAddress,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public payable onlyMember whenNotPaused {

    require(coverCurr == "ETH", "Pool: Unexpected asset type");
    require(msg.value == coverDetails[1], "Pool: ETH amount does not match premium");

    quotation.verifyCoverDetails(msg.sender, contractAddress, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
  }
}
