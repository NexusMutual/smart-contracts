// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

contract LegacyMaster {

  mapping(bytes2 => address payable) internal addresses;

  function setAddress(bytes2 code, address payable _address) external {
    addresses[code] = _address;
  }

  function getLatestAddress(bytes2 code) external view returns (address payable) {
    return addresses[code];
  }

}
