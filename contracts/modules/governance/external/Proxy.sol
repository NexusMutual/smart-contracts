// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

/**
 * @title Proxy
 * @dev Gives the possibility to delegate any call to a foreign implementation.
 */
abstract contract Proxy {



  /**
  * @dev Tells the address of the implementation where every call will be delegated.
  * @return address of the implementation to which it will be delegated
  */
  function implementation() virtual public view returns (address);
}
