// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface INXMMaster {

  function tokenAddress() external view returns (address);

  function emergencyAdmin() external view returns (address);

  function isInternal(address _add) external view returns (bool);

  function isPause() external view returns (bool check);

  function isMember(address _add) external view returns (bool);

  function checkIsAuthToGoverned(address _add) external view returns (bool);

  function getLatestAddress(bytes2 _contractName) external view returns (address payable contractAddress);

  function contractAddresses(bytes2 code) external view returns (address payable);

}
