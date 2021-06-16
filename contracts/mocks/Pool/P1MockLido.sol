// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";

contract P1MockLido is ERC20Mintable, ERC20Detailed {

  uint public ethToStETHRate = 10000;

  constructor() ERC20Detailed("Lido", "LIDO", 18) public {
    /* noop */
  }

  // fallback
  function() external payable {
    // protection against accidental submissions by calling non-existent function
    require(msg.data.length == 0, "NON_EMPTY_DATA");
    _mint(msg.sender, msg.value * ethToStETHRate / 10000);
  }

  function setETHToStETHRate(uint _ethToStETHRate) public {
    ethToStETHRate = _ethToStETHRate;
  }
}
