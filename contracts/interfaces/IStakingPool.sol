// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;


interface IStakingPool {

  function buyCover(
    uint productId,
    uint coveredAmount,
    uint rewardAmount,
    uint period,
    uint capacityFactor
  ) external;

  function getAvailableCapacity(uint productId, uint capacityFactor) external view returns (uint);
  function getUsedCapacity(uint productId) external view returns (uint);
  function getTargetPrice(uint productId, uint amount, uint period) external view returns (uint);
  function getStake(uint productId) external view returns (uint);
}
