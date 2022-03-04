// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

interface ICowSettlement {
  function setPreSignature(bytes calldata orderUid, bool signed) external;

  function filledAmount(bytes calldata orderUid) external view returns (uint256);

  function vaultRelayer() external view returns (address);
}
