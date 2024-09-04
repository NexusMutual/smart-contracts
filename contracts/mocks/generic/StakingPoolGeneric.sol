// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IStakingPool.sol";

contract StakingPoolGeneric is IStakingPool {

  function initialize(bool, uint, uint, uint) external virtual {
    revert("Unsupported");
  }

  function processExpirations(bool) external virtual {
    revert("Unsupported");
  }

  function requestAllocation(uint, uint, AllocationRequest calldata) external virtual returns (uint, uint) {
    revert("Unsupported");
  }

  function burnStake(uint, BurnStakeParams calldata) external virtual {
    revert("Unsupported");
  }

  function depositTo(uint, uint, uint, address) external virtual returns (uint) {
    revert("Unsupported");
  }

  function withdraw(uint, bool, bool, uint[] memory) external virtual returns (uint, uint) {
    revert("Unsupported");
  }

  function isPrivatePool() external virtual view returns (bool) {
    revert("Unsupported");
  }

  function isHalted() external virtual pure returns (bool) {
    revert("Unsupported");
  }

  function manager() external virtual pure returns (address) {
    revert("Unsupported");
  }

  function getPoolId() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getPoolFee() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getMaxPoolFee() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getActiveStake() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getStakeSharesSupply() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getRewardsSharesSupply() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getRewardPerSecond() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getAccNxmPerRewardsShare() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getLastAccNxmUpdate() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getFirstActiveTrancheId() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getFirstActiveBucketId() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getNextAllocationId() external virtual pure returns (uint) {
    revert("Unsupported");
  }

  function getDeposit(uint, uint) external virtual pure returns (uint, uint, uint, uint) {
    revert("Unsupported");
  }

  function getTranche(uint) external virtual pure returns (uint, uint) {
    revert("Unsupported");
  }

  function getExpiredTranche(uint) external virtual pure returns (uint, uint, uint) {
    revert("Unsupported");
  }

  function setPoolFee(uint) external virtual {
    revert("Unsupported");
  }

  function setPoolPrivacy(bool) external virtual {
    revert("Unsupported");
  }

  function getActiveAllocations(uint) external virtual pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function getTrancheCapacities(uint, uint, uint, uint, uint) external virtual pure returns (uint[] memory) {
    revert("Unsupported");
  }

  // TODO: remove me after upgrade
  function updateRewardsShares(uint, uint[] calldata) external virtual {
    revert("Unsupported");
  }
}
