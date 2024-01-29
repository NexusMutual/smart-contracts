// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ISwapOperator.sol";

contract SafeTrackerSwapOperatorMock is ISwapOperator {

  function orderInProgress() external virtual pure returns (bool) {
    revert("orderInProgress not yet implemented");
  }
  function requestAsset(address, uint) external virtual pure {
    revert("requestETH not yet implemented");
  }

  function transferRequestedAsset(address, uint) external virtual pure {
    revert("requestETH not yet implemented");
  }
}
