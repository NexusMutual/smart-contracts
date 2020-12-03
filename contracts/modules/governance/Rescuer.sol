pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Rescuer {

  address public constant SAI = 0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359;
  address public constant WNXM = 0x0d438F3b5175Bebc262bF23753C1E53d03432bDE;
  address public constant DEST = 0x0000000000000000000000000000000000001337;

  // used to mock pooldata contract
  function getCurrencyAssetAddress(bytes4 curr) external pure returns (address) {
    require(curr == "SAI", "Rescuer: unknown currency");
    return SAI;
  }

  // transfer rescued tokens
  function transfer(address tokenAddress) external {
    require(tokenAddress == SAI || tokenAddress == WNXM, "Rescuer: can only rescue SAI and WNXM");
    IERC20 token = IERC20(tokenAddress);
    uint balance = token.balanceOf(address(this));
    require(token.transfer(DEST, balance), "Rescuer: token transfer failed");
  }

}
