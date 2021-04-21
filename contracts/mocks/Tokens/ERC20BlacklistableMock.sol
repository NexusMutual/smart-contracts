pragma solidity ^0.5.0;

import "./ERC20Mock.sol";

contract ERC20BlacklistableMock is ERC20Mock {

  mapping(address => bool) isBlacklisted;

  // Blacklist functionality to be able to make transactions fail
  function transfer(address recipient, uint256 amount) public returns (bool) {
    require(!isBlacklisted[recipient], "ERC20Mock: recipient is blacklisted");
    _transfer(_msgSender(), recipient, amount);
    return true;
  }

  function whitelist(address recipient) public {
    isBlacklisted[recipient] = false;
  }

  function blacklist(address recipient) public {
    isBlacklisted[recipient] = true;
  }

}
