// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../modules/governance/Registry.sol";

contract DisposableRegistry is Registry {

  constructor(
    address _verifyingAddress,
    address _master
  ) Registry(_verifyingAddress, _master) { }

  function setGovernor(address _governor) external {
    contracts[C_GOVERNOR] = Contract({ addr: _governor, isProxy: true });
    contractIndexes[_governor] = C_GOVERNOR;
  }

  function replaceGovernor(bytes32 _salt, address _governorImplementation) external {
    delete contracts[C_GOVERNOR];
    delete contractIndexes[contracts[C_GOVERNOR].addr];
    _deployContract(C_GOVERNOR, _salt, _governorImplementation);
  }

}
