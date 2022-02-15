// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/extensions/draft-ERC20Permit.sol";

contract ERC20PermitMock is ERC20Permit {

  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) ERC20Permit(name_) {
    /* noop */
  }

  function mint(address account, uint256 amount) external {
    _mint(account, amount);
  }

}
