// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ISwapOperator.sol";

contract STMockSwapOperator is ISwapOperator {

  function requestAsset(address, uint) external virtual pure {
    revert("Unsupported");
  }

  function transferRequestedAsset(address, uint) external virtual pure {
    revert("Unsupported");
  }

  function getDigest(GPv2Order.Data calldata) external virtual view returns (bytes32) {
    revert("Unsupported");
  }

  function getUID(GPv2Order.Data calldata) external virtual view returns (bytes memory) {
    revert("Unsupported");
  }

  function orderInProgress() external virtual pure returns (bool) {
    revert("Unsupported");
  }

  function placeOrder(GPv2Order.Data calldata, bytes calldata) external virtual {
    revert("Unsupported");
  }

  function closeOrder(GPv2Order.Data calldata) external virtual {
    revert("Unsupported");
  }

  function swapEnzymeVaultShareForETH(uint, uint) external virtual {
    revert("Unsupported");
  }

  function swapETHForEnzymeVaultShare(uint, uint) external virtual {
    revert("Unsupported");
  }

  function recoverAsset(address, address) external virtual {
    revert("Unsupported");
  }
}
