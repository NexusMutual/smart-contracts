// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../generic/NXMasterGeneric.sol";

contract RGMockMaster is NXMasterGeneric {

  // bytes2[] public contractCodes;
  // mapping(address => bool) public contractsActive;
  mapping(bytes2 => address payable) public override contractAddresses;

  function setLatestAddress(bytes2 code, address payable addr) external {
    contractAddresses[code] = addr;
    // contractsActive[addr] = true;
    // contractCodes.push(code);
  }

  function getLatestAddress(bytes2 code) external view override returns (address payable) {
    return contractAddresses[code];
  }

}
