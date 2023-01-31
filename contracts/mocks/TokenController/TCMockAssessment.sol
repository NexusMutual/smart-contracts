// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

contract TCMockAssessment {
  mapping(address => uint) public unclaimedGovernanceRewards;
  address public withdrawRewardsLastCalledWithStaker;
  uint public withdrawRewardsLastCalledWithBatchSize;

  function withdrawRewards(
    address staker,
    uint104 batchSize
  ) external returns (uint /* withdrawn */, uint /*withdrawnUntilIndex*/) {
    withdrawRewardsLastCalledWithStaker = staker;
    withdrawRewardsLastCalledWithBatchSize = batchSize;

    return (0, 0);
  }
}
