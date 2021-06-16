// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../modules/distributor/Distributor.sol";

contract CoverBuyer {

  Distributor distributor;

  constructor(address payable distributorAddress) {
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

