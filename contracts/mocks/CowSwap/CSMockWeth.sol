// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import '@openzeppelin/contracts-v4/token/ERC20/ERC20.sol';

contract CSMockWeth is ERC20 {
  constructor() ERC20('WETH', 'WETH') {}

  function deposit() public payable {
    _mint(msg.sender, msg.value);
  }

  function withdraw(uint256 wad) public {
    require(balanceOf(msg.sender) >= wad, 'no balance');
    _burn(msg.sender, wad);
    payable(msg.sender).transfer(wad);
  }

  function mint(address who, uint256 amount) public {
    _mint(who, amount);
  }
}
