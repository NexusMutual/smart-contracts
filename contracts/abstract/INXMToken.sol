pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract INXMToken is IERC20 {

  function burn(uint256 amount) public returns (bool);

  function burnFrom(address from, uint256 value) public returns (bool);

  function operatorTransfer(address from, uint256 value) public returns (bool);

  function mint(address account, uint256 amount) public;
}
