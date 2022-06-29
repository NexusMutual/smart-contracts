// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IAddressListRegistry {
  function isInList(uint id, address member) external view returns (bool);
}
