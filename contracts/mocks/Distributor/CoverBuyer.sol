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

import "../../modules/distributor/Distributor.sol";

contract CoverBuyer {

  Distributor distributor;

  constructor(address payable distributorAddress) public {
    distributor = Distributor(distributorAddress);
  }

  function buyCover (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    uint8 coverType,
    bytes calldata data
  ) external payable {
    distributor.buyCover{ value: msg.value }(contractAddress, coverAsset, sumAssured, coverPeriod, coverType, 2 * msg.value, data);
  }

  receive () payable external {
    revert("I hate ether.");
  }
}

