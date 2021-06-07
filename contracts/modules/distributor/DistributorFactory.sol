// SPDX-License-Identifier: GPL-3.0

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

pragma solidity ^0.8.0;

import "./Distributor.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IMemberRoles.sol";

contract DistributorFactory {
  INXMMaster immutable public master;

  event DistributorCreated(
    address contractAddress,
    address owner,
    uint feePercentage,
    address treasury
  );

  constructor (address masterAddress) {
    master = INXMMaster(masterAddress);
  }

  function newDistributor(
    uint _feePercentage,
    address payable treasury,
    string memory tokenName,
    string memory tokenSymbol
  ) public payable returns (address) {

    IMemberRoles memberRoles = IMemberRoles(master.getLatestAddress("MR"));
    Distributor d = new Distributor(
      master.getLatestAddress("GW"),
      master.tokenAddress(),
      address(master),
      _feePercentage,
      treasury,
      tokenName,
      tokenSymbol
    );
    d.transferOwnership(msg.sender);
    memberRoles.payJoiningFee{ value: msg.value}(address(d));

    emit DistributorCreated(address(d), msg.sender, _feePercentage, treasury);
    return address(d);
  }
}
