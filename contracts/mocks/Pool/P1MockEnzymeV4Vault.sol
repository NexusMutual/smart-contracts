// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

contract P1MockEnzymeV4Vault {

  address accessor;

  constructor(address _accessor) public {
    accessor = _accessor;
  }

  function getAccessor() external view returns (address) {
    return accessor;
  }
}
