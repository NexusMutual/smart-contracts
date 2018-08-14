pragma solidity ^0.4.24;

contract Migrations {
  address public owner;
  uint public last_completed_migration;

  modifier restricted() {
    _;
  }

  function Migrations() {
  }

  function setCompleted(uint completed) restricted {
  }

  function upgrade(address new_address) restricted {
  }
}