// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IPolicyManager {

  function updatePolicySettingsForFund(
    address _comptrollerProxy,
    address _policy,
    bytes calldata _settingsData
  ) external;

}
