// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";

contract ERC20Dai is ERC20Mintable, ERC20Detailed {
  constructor() public ERC20Detailed("DAI", "DAI", 18) {
    /* noop */
  }

  function setBalance(address account, uint256 amount) public {
    _burn(account, balanceOf(account));
    _mint(account, amount);
  }
}
