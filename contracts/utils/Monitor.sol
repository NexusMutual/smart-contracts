// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../interfaces/INXMMaster.sol";
import "../interfaces/IMCR.sol";

interface Token {
  function balanceOf(address) external view returns (uint);
}

contract Monitor {
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  INXMMaster immutable master;

  constructor(INXMMaster _master) {
    master = _master;
  }

  function getBalance(address target, address token) public view returns (uint) {

    if (token == ETH) {
      return target.balance;
    }
    return Token(token).balanceOf(target);
  }

  function getInternalContractBalance(bytes2 code, address token) public view returns (uint) {
    return getBalance(master.getLatestAddress(code), token);
  }

  function getTimeSinceLastMCRUpdate() public view returns (uint) {
    return block.timestamp - uint(IMCR(master.getLatestAddress("MC")).lastUpdateTime());
  }
}
