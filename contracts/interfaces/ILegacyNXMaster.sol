// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface ILegacyNXMaster {

  struct EmergencyPause {
    bool pause;
    uint time;
    bytes4 by;
  }

  function emergencyPaused(uint i) external view returns (EmergencyPause calldata);

  function contractsActive(address a) external view returns (bool);
  function isProxy(bytes2 code) external view returns (bool);
  function isUpgradable(bytes2 code) external view returns (bool);

  function tokenAddress() external view returns (address);

  function owner() external view returns (address);

  function masterInitialized() external view returns (bool);

  function pauseTime() external view returns (uint);

  function isInternal(address _add) external view returns (bool);

  function isPause() external view returns (bool check);

  function isOwner(address _add) external view returns (bool);

  function isMember(address _add) external view returns (bool);

  function checkIsAuthToGoverned(address _add) external view returns (bool);

  function dAppLocker() external view returns (address _add);

  function getLatestAddress(bytes2 _contractName) external view returns (address payable contractAddress);

  function getVersionData()
  external
  view
  returns (
    bytes2[] memory contractsName,
    address[] memory contractsAddress
  );
}
