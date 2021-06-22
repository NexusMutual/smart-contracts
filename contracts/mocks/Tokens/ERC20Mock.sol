// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";

contract ERC20Mock is ERC20Mintable, ERC20Detailed {

  constructor() ERC20Detailed("ERC20 mock", "MOCK", 18) public {
    /* noop */
  }

}
