// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../interfaces/IUpgradeableProxy.sol";

contract UpgradeableProxy is IUpgradeableProxy {

  bytes32 private constant IMPLEMENTATION_POSITION = bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1);
  bytes32 private constant PROXY_OWNER_POSITION = bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1);

  modifier onlyProxyOwner() {
    require(msg.sender == proxyOwner());
    _;
  }

  constructor() {
    _sstore(PROXY_OWNER_POSITION, msg.sender);
  }

  function _sload(bytes32 position) internal view returns (address value) {
    // solhint-disable-next-line no-inline-assembly
    assembly { value := sload(position) }
  }

  function _sstore(bytes32 position, address value) internal {
    // solhint-disable-next-line no-inline-assembly
    assembly { sstore(position, value) }
  }

  function proxyOwner() public view returns (address owner) {
    return _sload(PROXY_OWNER_POSITION);
  }

  function implementation() public view returns (address impl) {
    return _sload(IMPLEMENTATION_POSITION);
  }

  function transferProxyOwnership(address _newOwner) public onlyProxyOwner {
    require(_newOwner != address(0), InvalidAddress());
    address _previousOwner = _sload(PROXY_OWNER_POSITION);
    _sstore(PROXY_OWNER_POSITION, _newOwner);
    emit ProxyOwnershipTransferred(_previousOwner, _newOwner);
  }

  function upgradeTo(address _newImplementation) public onlyProxyOwner {
    _sstore(IMPLEMENTATION_POSITION, _newImplementation);
    emit Upgraded(_newImplementation);
  }

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

  fallback() external payable {
    _delegate();
  }

  receive() external payable {
    _delegate();
  }
}
