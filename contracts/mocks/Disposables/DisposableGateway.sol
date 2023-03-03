// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../modules/legacy/LegacyGateway.sol";

contract DisposableGateway is LegacyGateway {

  constructor(address _quotationData) LegacyGateway(_quotationData) {}

  function initialize(address masterAddress, address daiAddress) external {
    master = INXMMaster(masterAddress);
    DAI = daiAddress;
  }
}
