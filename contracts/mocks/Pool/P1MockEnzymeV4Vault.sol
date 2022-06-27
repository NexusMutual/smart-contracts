// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../external/enzyme/IEnzymeV4Vault.sol";

contract P1MockEnzymeV4Vault is IEnzymeV4Vault {

  address accessor;

  constructor(address _accessor) public {
    accessor = _accessor;
  }

  function getAccessor() external view returns (address) {
    return accessor;
  }
}
