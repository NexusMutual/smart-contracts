// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "./ERC20Mock.sol";

contract ERC20BlacklistableMock is ERC20Mock {

  mapping(address => bool) isBlacklisted;
  mapping(address => bool) isSenderBlacklisted;

  // blacklist functionality to be able to make transactions fail
  function transfer(address recipient, uint256 amount) public override returns (bool) {
    require(!isBlacklisted[recipient], "ERC20Mock: recipient is blacklisted");
    require(!isSenderBlacklisted[_msgSender()], "ERC20Mock: sender is blacklisted");
    _transfer(_msgSender(), recipient, amount);
    return true;
  }

  function whitelist(address recipient) public {
    isBlacklisted[recipient] = false;
  }

  function whitelistSender(address sender) public {
    isSenderBlacklisted[sender] = false;
  }

  function blacklist(address recipient) public {
    isBlacklisted[recipient] = true;
  }

  function blacklistSender(address sender) public {
    isSenderBlacklisted[sender] = true;
  }

}
