// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../modules/governance/Registry.sol";

contract DisposableRegistry is Registry {

  constructor(
    address _verifyingAddress,
    address _master
  ) Registry(_verifyingAddress, _master) { }

  function addGovernor(address governorImplementation) external {
    _deployContract(C_GOVERNOR, 0, governorImplementation);
  }

}
