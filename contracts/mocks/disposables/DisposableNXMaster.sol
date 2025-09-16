// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../modules/governance/NXMaster.sol";

contract DisposableNXMaster is NXMaster {

  function initialize(
    address _registry,
    address _memberRoles
  ) external {
    registry = IRegistry(_registry);
    contractAddresses["MR"] = payable(_memberRoles);
    contractAddresses["MS"] = payable(address(this));
  }

}
