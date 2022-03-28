// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

struct Staker {
  uint deposit; // total amount of deposit nxm
  uint reward; // total amount that is ready to be claimed
  address[] contracts; // list of contracts the staker has staked on

  // staked amounts for each contract
  mapping(address => uint) stakes;

  // amount pending to be subtracted after all unstake requests will be processed
  mapping(address => uint) pendingUnstakeRequestsTotal;

  // flag to indicate the presence of this staker in the array of stakers of each contract
  mapping(address => bool) isInContractStakers;
}

struct Burn {
  uint amount;
  uint burnedAt;
  address contractAddress;
}

struct Reward {
  uint amount;
  uint rewardedAt;
  address contractAddress;
}

struct UnstakeRequest {
  uint amount;
  uint unstakeAt;
  address contractAddress;
  address stakerAddress;
  uint next; // id of the next unstake request in the linked list
}

struct ContractReward {
  uint amount;
  uint lastDistributionRound;
}

interface IPooledStaking {

  function accumulateReward(address contractAddress, uint amount) external;

  function pushBurn(address contractAddress, uint amount) external;

  function hasPendingActions() external view returns (bool);

  function processPendingActions(uint maxIterations) external returns (bool finished);

  function contractStake(address contractAddress) external view returns (uint);

  function stakerReward(address staker) external view returns (uint);

  function stakerDeposit(address staker) external view returns (uint);

  function stakerContractStake(address staker, address contractAddress) external view returns (uint);

  function withdraw(uint amount) external;

  function withdrawForUser(address user) external;

  function stakerMaxWithdrawable(address stakerAddress) external view returns (uint);

  function withdrawReward(address stakerAddress) external;

  function blockV1() external;
}
