// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../modules/legacy/LegacyGateway.sol";

contract DisposableGateway is LegacyGateway {

  function initialize(address masterAddress, address daiAddress) external {
    master = INXMMaster(masterAddress);
    DAI = daiAddress;
  }
}
