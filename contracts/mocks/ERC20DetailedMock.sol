pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

contract ERC20DetailedMock is ERC20, ERC20Detailed("DragosToken", "DGT", 18) {

  function mint(uint256 amount) public {
    _mint(msg.sender, amount);
  }

  function mint(address account, uint256 amount) public {
    _mint(account, amount);
  }

}
