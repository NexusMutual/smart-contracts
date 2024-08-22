// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IPooledStaking.sol";

contract PooledStakingGeneric is IPooledStaking {

  function accumulateReward(address, uint) external virtual {
    revert("accumulateReward unsupported");
  }

  function pushBurn(address, uint) external virtual {
    revert("pushBurn unsupported");
  }

  function hasPendingActions() external virtual view returns (bool) {
    revert("hasPendingActions unsupported");
  }

  function processPendingActions(uint) external virtual returns (bool) {
    revert("processPendingActions unsupported");
  }

  function contractStake(address) external virtual view returns (uint) {
    revert("contractStake unsupported");
  }

  function stakerReward(address) external virtual view returns (uint) {
    revert("stakerReward unsupported");
  }

  function stakerDeposit(address) external virtual view returns (uint) {
    revert("stakerDeposit unsupported");
  }

  function stakerContractStake(address, address) external virtual view returns (uint) {
    revert("stakerContractStake unsupported");
  }

  function withdraw(uint) external virtual {
    revert("withdraw unsupported");
  }

  function withdrawForUser(address) external virtual {
    revert("withdrawForUser unsupported");
  }

  function stakerMaxWithdrawable(address) external virtual view returns (uint) {
    revert("stakerMaxWithdrawable unsupported");
  }

  function withdrawReward(address) external virtual {
    revert("withdrawReward unsupported");
  }
}
