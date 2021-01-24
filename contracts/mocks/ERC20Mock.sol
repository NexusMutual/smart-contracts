pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

contract ERC20Mock is ERC20 {

  mapping (address => bool) isBlacklisted;

  function mint(uint256 amount) public {
    _mint(msg.sender, amount);
  }

  function mint(address account, uint256 amount) public {
    _mint(account, amount);
  }

  // Blacklist functionality to be able to make transactions fail
  function _transfer(address sender, address recipient, uint256 amount) internal {
    require(!isBlacklisted[recipient], "ERC20Mock: recipient is blacklisted");
    super._transfer(sender, recipient, amount);
  }

  function transfer(address recipient, uint256 amount) public returns (bool) {
    require(!isBlacklisted[recipient], "ERC20Mock: recipient is blacklisted");
    (_msgSender(), recipient, amount);
    return true;
  }

  function whitelist(address recipient) public {
    isBlacklisted[recipient] = false;
  }

  function blacklist(address recipient) public {
    isBlacklisted[recipient] = true;
  }
}
