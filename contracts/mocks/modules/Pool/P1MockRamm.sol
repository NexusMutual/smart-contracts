// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/RammGeneric.sol";

contract P1MockRamm is RammGeneric {
  function getInternalPrice() external override pure returns (uint) {
    return 0.02364 ether;
  }

  function getInternalPriceAndUpdateTwap() external override pure returns (uint) {
    return 0.02364 ether;
  }

  function getSpotPrices() external override pure returns (uint, uint) {
    return (0.02253 ether, 0.02444 ether);
  }
}
