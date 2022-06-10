// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../Tokens/ERC721Mock.sol";

contract MRMockStakingPool is ERC721Mock {

  constructor(string memory name, string memory symbol) ERC721Mock(name, symbol) {
    /* noop */
  }

  function operatorTransfer(
    address from,
    address to,
    uint[] calldata tokenIds
  ) external {
    uint length = tokenIds.length;
    for (uint i = 0; i < length; i++) {
      _safeTransfer(from, to, tokenIds[i], "");
    }
  }

}
