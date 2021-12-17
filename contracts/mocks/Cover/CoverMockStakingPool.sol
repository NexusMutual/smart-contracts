// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IStakingPool.sol";
import "hardhat/console.sol";

contract CoverMockStakingPool is IStakingPool {

  mapping (uint => uint) public usedCapacity;
  mapping (uint => uint) public stake;
  mapping (uint => uint) public targetPrices;

  mapping (uint => uint) public mockPrices;

  address public override manager;

  function initialize(address _manager) external override {
    manager = _manager;
  }

  function allocateCapacity(AllocateCapacityParams calldata params) external override returns (uint, uint) {
    usedCapacity[params.productId] += params.coverAmount;
    return (0, 0);
  }

  function freeCapacity(
    uint productId,
    uint previousPeriod,
    uint previousStartTime,
    uint previousRewardAmount,
    uint periodReduction,
    uint coveredAmount
  ) external override {
    // no-op
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

  function setPrice(uint productId, uint price) external {
    mockPrices[productId] = price;
  }

}
