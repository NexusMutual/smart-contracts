// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IStakingPoolFactory.sol";

contract StakingPoolFactoryGeneric is IStakingPoolFactory {

  function stakingPoolCount() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function beacon() external virtual view returns (address) {
    revert("Unsupported");
  }

  function create(address) external virtual returns (uint, address) {
    revert("Unsupported");
  }

  function setStakingPoolCount(uint) public virtual {
    revert("Unsupported");
  }
}
