// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../external/cow/GPv2Order.sol";
import "../../interfaces/ISwapOperator.sol";

contract SwapOperatorGeneric is ISwapOperator {

  function getDigest(GPv2Order.Data calldata) external virtual view returns (bytes32) {
    revert("Unsupported");
  }

  function getUID(GPv2Order.Data calldata) external virtual view returns (bytes memory) {
    revert("Unsupported");
  }

  function orderInProgress() external virtual pure returns (bool) {
    revert("Unsupported");
  }

  /* ==== MUTATIVE FUNCTIONS ==== */

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

  function requestAsset(address, uint) external virtual {
    revert("Unsupported");
  }

  function transferRequestedAsset(address, uint) external virtual {
    revert("Unsupported");
  }
}
