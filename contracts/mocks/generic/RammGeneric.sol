// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IRamm.sol";

contract RammGeneric is IRamm {
  function updateTwap() external override pure {
    revert("Unsupported");
  }

  function getInternalPriceAndUpdateTwap() external virtual override pure returns (uint) {
    revert("Unsupported");
  }

  function getInternalPrice() external virtual override pure returns (uint) {
    revert("Unsupported");
  }

  function getSpotPrices() external virtual override pure returns (uint, uint) {
    revert("Unsupported");
  }

  function getReserves() public pure returns (uint, uint, uint, uint){
    revert("Unsupported");
  }

  function getBookValue() external override pure returns (uint) {
    revert("Unsupported");
  }

  function swap(uint, uint, uint) external payable returns (uint) {
    revert("Unsupported");
  }

  function removeBudget() external pure {
    revert("Unsupported");
  }

  function setEmergencySwapPause(bool) external pure {
    revert("Unsupported");
  }
}
