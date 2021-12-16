// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;


interface IStakingPool {

  struct AllocateCapacityParams {
    uint productId;
    uint coverAmount;
    uint rewardsDenominator;
    uint period;
    uint globalCapacityRatio;
    uint globalRewardsRatio;
    uint capacityReductionRatio;
    uint initialPrice;
  }

  function initialize(address manager) external;

  function allocateCapacity(AllocateCapacityParams calldata params) external returns (uint, uint);

  function freeCapacity(
    uint productId,
    uint previousPeriod,
    uint previousStartTime,
    uint previousRewardAmount,
    uint periodReduction,
    uint coveredAmount
  ) external;

  function getAvailableCapacity(uint productId, uint capacityFactor) external view returns (uint);
  function getCapacity(uint productId, uint capacityFactor) external view returns (uint);
  function getUsedCapacity(uint productId) external view returns (uint);
  function getTargetPrice(uint productId) external view returns (uint);
  function getStake(uint productId) external view returns (uint);
  function manager() external view returns (address);
}
