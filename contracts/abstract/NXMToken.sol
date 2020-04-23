pragma solidity ^0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/*
 * This file and directory exists because interface inheritance is not allowed in solidity 0.5
 * This was implemented in solidity > 0.6.1
 */

contract NXMToken is IERC20 {

  function burn(uint256 amount) public returns (bool);

  function burnFrom(address from, uint256 value) public returns (bool);

  function mint(address account, uint256 amount) public;
}
