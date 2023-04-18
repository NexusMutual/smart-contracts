// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;
import "../../interfaces/IAssessment.sol";

contract MRMockAssessment {
  mapping(address => IAssessment.Stake) public stakeOf;

  function setStakeOf(address staker, uint96 stakeAmount) external {
    stakeOf[staker] = IAssessment.Stake(stakeAmount, 0 /* rewardWithdrawableFromIndex */ , 0 /* fraudCount */);
  }
}
