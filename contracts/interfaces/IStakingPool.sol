// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface IStakingPool is IERC721 {

  struct Weight {
    uint productId;
    uint weight;
  }

  function initialize(address _manager, uint _poolId) external;

  function operatorTransferFrom(address from, address to, uint256 amount) external;

  function allocateStake(uint productId, uint amountInNXM, uint period, uint rewardRatio, uint initialPriceRatio) external returns (uint allocatedNXM, uint premium);

  function freeCapacity(
    uint productId,
    uint previousPeriod,
    uint previousStartTime,
    uint previousRewardAmount,
    uint periodReduction,
    uint coveredAmount
  ) external;

  function updateGroups() external;

  function deposit(uint amount, uint groupId, uint _positionId) external returns (uint positionId);

  function burn(uint amount /* uint start?, uint period? */) external;

  function setWeights(Weight[] memory weights) external;

/*
  function getAvailableCapacity(uint productId, uint capacityFactor) external view returns (uint);

  function getCapacity(uint productId, uint capacityFactor) external view returns (uint);

  function getUsedCapacity(uint productId) external view returns (uint);

  function getTargetPrice(uint productId) external view returns (uint);

  function getStake(uint productId) external view returns (uint);

  function manager() external view returns (address);
*/

}
