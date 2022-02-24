// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.0;

import './CSMockVaultRelayer.sol';

contract CSMockSettlement {
  CSMockVaultRelayer public immutable vaultRelayer;

  constructor(address _vault) {
    vaultRelayer = CSMockVaultRelayer(_vault);
  }
}
