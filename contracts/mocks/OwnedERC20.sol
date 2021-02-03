pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

contract OwnedERC20 is ERC20, Ownable {

  function mint(uint256 amount) public onlyOwner {
    _mint(msg.sender, amount);
  }

  function mint(address account, uint256 amount) public onlyOwner {
    _mint(account, amount);
  }

}
