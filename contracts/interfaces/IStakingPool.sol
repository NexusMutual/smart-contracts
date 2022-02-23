// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

interface IStakingPool is IERC20 {

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

  function initialize(address _manager, uint _poolId) external;

  function operatorTransferFrom(address from, address to, uint256 amount) external;

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

  function getPriceParameters(
    uint productId,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) external view returns (
    uint activeCover, uint capacity, uint lastBasePrice, uint targetPrice
  );
}
