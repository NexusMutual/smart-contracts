// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../common/ERC20Detailed.sol";
import "../common/ERC20Mintable.sol";

contract ERC20MockNameable is ERC20Mintable, ERC20Detailed {
  constructor(string memory name, string memory symbol) public ERC20Detailed(name, symbol, 18) {
    /* noop */
  }

  function setBalance(address account, uint256 amount) public {
    _burn(account, balanceOf(account));
    _mint(account, amount);
  }
}
