// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../modules/legacy/LegacyGateway.sol";

contract DisposableGateway is LegacyGateway {

  constructor(address _quotationData, address _tokenAddress) LegacyGateway(_quotationData, _tokenAddress) {}

  function initialize(address masterAddress, address daiAddress) external {
    master = INXMMaster(masterAddress);
    DAI = daiAddress;
  }
}
