// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IUpgradeableProxy {

  event Upgraded(address indexed implementation);
  event ProxyOwnershipTransferred(address previousOwner, address newOwner);

  function proxyOwner() external view returns (address);

  function implementation() external view returns (address);

  function transferProxyOwnership(address _newOwner) external;

  function upgradeTo(address _newImplementation) external;

  error InvalidAddress();

}
