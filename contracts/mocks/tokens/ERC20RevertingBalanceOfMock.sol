// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../common/ERC20Detailed.sol";
import "../common/ERC20Mintable.sol";

contract ERC20RevertingBalanceOfMock is ERC20Mintable, ERC20Detailed {

  bool isReverting = false;

  constructor() ERC20Detailed("ERC20 mock", "MOCK", 18) public {
    /* noop */
  }

  function balanceOf(address account) public view returns (uint) {

    if (isReverting) {
      revert("ERC20RevertingBalanceOfMock: balanceOf reverted");
    }

    return super.balanceOf(account);
  }

  function setIsReverting(bool _isReverting) public {
    isReverting = _isReverting;
  }

  function setBalance(address account, uint256 amount) public {
    _burn(account, balanceOf(account));
    _mint(account, amount);
  }
}
