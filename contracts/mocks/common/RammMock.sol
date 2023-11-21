// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IRamm.sol";

contract RammMock is IRamm {

  event TwapUpdateTriggered();

  function updateTwap() external override {
    emit TwapUpdateTriggered();
  }

  function getInternalPriceAndUpdateTwap() external override pure returns (uint) {
    return 1e18;
  }

  function getInternalPrice() external override pure returns (uint) {
    return 1e18;
  }

  function getSpotPrices() external override pure returns (uint, uint) {
    return (2e18, 1e18);
  }

  /* ====== NOT NEEDED FUNCTIONS ====== */

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
