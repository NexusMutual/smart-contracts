// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../common/ERC20Detailed.sol";
import "../common/ERC20Mintable.sol";

contract ERC20MintableDetailed is ERC20Mintable, ERC20Detailed {

  constructor(string memory name, string memory symbol, uint8 decimals) ERC20Detailed(name, symbol, decimals) public {
    /* noop */
  }

}
