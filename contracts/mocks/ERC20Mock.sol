pragma solidity ^0.5.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {

  function mint(uint256 amount) public {
    _mint(msg.sender, amount);
  }

  function mint(address account, uint256 amount) public {
    _mint(account, amount);
  }

}
