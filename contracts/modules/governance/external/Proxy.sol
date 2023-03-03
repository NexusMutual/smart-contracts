// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

/**
 * @title Proxy
 * @dev Gives the possibility to delegate any call to a foreign implementation.
 */
abstract contract Proxy {

  /**
   * @dev Delegates the current call to `implementation`.
   */
  function _delegate() internal {
    address _impl = implementation();
    require(_impl != address(0));

    // solhint-disable-next-line no-inline-assembly
    assembly {
      let ptr := mload(0x40)
      calldatacopy(ptr, 0, calldatasize())
      let result := delegatecall(gas(), _impl, ptr, calldatasize(), 0, 0)
      let size := returndatasize()
      returndatacopy(ptr, 0, size)

      switch result
      case 0 {revert(ptr, size)}
      default {return (ptr, size)}
    }
  }

  /**
  * @dev Fallback function allowing to perform a delegatecall to the given implementation.
  * This function will return whatever the implementation call returns
  */
  fallback() external payable {
    _delegate();
  }

  /**
  * @dev Receive function allowing to perform a delegatecall to the given implementation.
  * This function will return whatever the implementation call returns
  */
  receive() external payable {
    _delegate();
  }

  /**
  * @dev Tells the address of the implementation where every call will be delegated.
  * @return address of the implementation to which it will be delegated
  */
  function implementation() virtual public view returns (address);
}
