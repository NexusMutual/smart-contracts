// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/ERC20.sol";

contract SOMockExtraSpender {

  function spend(ERC20 asset, address from, uint amount) external {
    asset.transferFrom(from, address(this), amount);
  }

}
