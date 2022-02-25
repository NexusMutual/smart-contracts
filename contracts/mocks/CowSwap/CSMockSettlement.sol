// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.0;

import './CSMockVaultRelayer.sol';

contract CSMockSettlement {
  CSMockVaultRelayer public immutable vaultRelayer;

  mapping(bytes32 => bool) public presignatures;

  constructor(address _vault) {
    vaultRelayer = CSMockVaultRelayer(_vault);
  }

  function setPreSignature(bytes memory orderUID, bool signed) external {
    presignatures[keccak256(orderUID)] = signed;
  }
}
