// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IPooledStaking.sol";

contract PooledStakingGeneric is IPooledStaking {

  function accumulateReward(address, uint) external virtual {
    revert("Unsupported");
  }

  function pushBurn(address, uint) external virtual {
    revert("Unsupported");
  }

  function hasPendingActions() external virtual view returns (bool) {
    revert("Unsupported");
  }

  function processPendingActions(uint) external virtual returns (bool) {
    revert("Unsupported");
  }

  function contractStake(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function stakerReward(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function stakerDeposit(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function stakerContractStake(address, address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function withdraw(uint) external virtual {
    revert("Unsupported");
  }

  function withdrawForUser(address) external virtual {
    revert("Unsupported");
  }

  function stakerMaxWithdrawable(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function withdrawReward(address) external virtual {
    revert("Unsupported");
  }
}
