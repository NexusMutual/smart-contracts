// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IStakingPool.sol";

contract CoverMockStakingPool is IStakingPool {

  mapping (uint => uint) public usedCapacity;
  mapping (uint => uint) public stake;
  mapping (uint => uint) public targetPrices;

  function buyCover(
    uint productId,
    uint coveredAmount,
    uint rewardAmount,
    uint period,
    uint capacityFactor
  ) external override {
    usedCapacity[productId] += coveredAmount;
  }

  function extendPeriod(
    uint productId,
    uint previousPeriod,
    uint previousStartTime,
    uint previousRewardAmount,
    uint newPeriod,
    uint newRewardAmount,
    uint coveredAmount
  ) external override {
    revert("Unsupported");
  }

  function reducePeriod(
    uint productId,
    uint previousPeriod,
    uint previousStartTime,
    uint previousRewardAmount,
    uint periodReduction,
    uint coveredAmount
  ) external override {
    revert("Unsupported");
  }

  function getAvailableCapacity(uint productId, uint capacityFactor) external override view returns (uint) {
    return stake[productId] * capacityFactor - usedCapacity[productId];
  }

  function getCapacity(uint productId, uint capacityFactor) external override view returns (uint) {
    return stake[productId] * capacityFactor;
  }

  function getUsedCapacity(uint productId) external override view returns (uint) {
    return usedCapacity[productId];
  }
  function getTargetPrice(uint productId) external override view returns (uint) {
    return targetPrices[productId];
  }
  function getStake(uint productId) external override view returns (uint) {
    return stake[productId];
  }

  function setUsedCapacity(uint productId, uint amount) external {
    usedCapacity[productId] = amount;
  }
  function setTargetPrice(uint productId, uint amount) external {
    targetPrices[productId] = amount;
  }
  function setStake(uint productId, uint amount) external {
    stake[productId] = amount;
  }

}
