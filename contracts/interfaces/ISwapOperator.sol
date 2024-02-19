// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../external/cow/GPv2Order.sol";

interface ISwapOperator {

  function getDigest(GPv2Order.Data calldata order) external view returns (bytes32);

  function getUID(GPv2Order.Data calldata order) external view returns (bytes memory);

  function placeOrder(GPv2Order.Data calldata order, bytes calldata orderUID) external;

  function orderInProgress() external returns (bool);

  function recoverAsset(address assetAddress, address receiver) external;
}
