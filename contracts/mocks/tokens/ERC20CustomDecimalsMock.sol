// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../common/ERC20Detailed.sol";
import "../common/ERC20Mintable.sol";

contract ERC20CustomDecimalsMock is ERC20Mintable, ERC20Detailed {
  constructor(uint8 decimals) public
  ERC20Detailed("ERC20CustomDecimalsMock", "USDC", decimals) {
    /* noop */
  }

  function setBalance(address account, uint256 amount) public {
    _burn(account, balanceOf(account));
    _mint(account, amount);
  }
}
