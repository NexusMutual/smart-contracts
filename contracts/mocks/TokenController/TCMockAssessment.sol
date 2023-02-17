// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;
import "../../interfaces/IAssessment.sol";

contract TCMockAssessment {
  mapping(address => IAssessment.Stake) public stakeOf;
  mapping(address => uint) public unclaimedGovernanceRewards;
  address public withdrawRewardsLastCalledWithStaker;
  uint public withdrawRewardsLastCalledWithBatchSize;

  function setStakeOf(address staker, uint96 stakeAmount) external {
    stakeOf[staker] = IAssessment.Stake(stakeAmount, 0 /* rewardWithdrawableFromIndex */ , 0 /* fraudCount */);
  }

  function withdrawRewards(
    address staker,
    uint104 batchSize
  ) external returns (uint /* withdrawn */, uint /*withdrawnUntilIndex*/) {
    withdrawRewardsLastCalledWithStaker = staker;
    withdrawRewardsLastCalledWithBatchSize = batchSize;

    return (0, 0);
  }
}
