// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import {AssessmentGeneric} from "../../generic/AssessmentGeneric.sol";

contract AVMockAssessment is AssessmentGeneric {

  // uint internal totalPendingAmountInNXM;
  // uint internal withdrawableAmountInNXM;
  // uint internal withdrawableUntilIndex;
  // uint internal stakeLockupPeriod;

  // constructor(uint _stakeLockupPeriod) {
  //   stakeLockupPeriod = _stakeLockupPeriod;
  // }

  // function getStakeLockupPeriod() external view override returns (uint) {
  //   return stakeLockupPeriod;
  // }

  // /* ========== SETTERS ========== */

  // function setVotesOf(address assessor, uint96 stakeAmount, uint assessmentId, bool isAcceptVote) external {
  //   votesOf[assessor].push(Vote(uint80(assessmentId), isAcceptVote, uint32(block.timestamp), stakeAmount));
  // }

  // function setStakeOf(
  //   address assessor,
  //   uint96 amount,
  //   uint104 rewardsWithdrawableFromIndex,
  //   uint16 fraudCount
  // ) external {
  //   stakeOf[assessor] = Stake({
  //     amount: amount,
  //     rewardsWithdrawableFromIndex: rewardsWithdrawableFromIndex,
  //     fraudCount: fraudCount
  //   });
  // }

  // function setRewards(
  //   uint _totalPendingAmountInNXM,
  //   uint _withdrawableAmountInNXM,
  //   uint _withdrawableUntilIndex
  // ) external {
  //   totalPendingAmountInNXM = _totalPendingAmountInNXM;
  //   withdrawableAmountInNXM = _withdrawableAmountInNXM;
  //   withdrawableUntilIndex = _withdrawableUntilIndex;
  // }

  // /* ========== VIEWS ========== */

  // function getVoteCountOfAssessor(address assessor) external view override returns (uint) {
  //   return votesOf[assessor].length;
  // }

  // function getRewards(address) external view override returns (uint, uint, uint) {
  //   return (totalPendingAmountInNXM, withdrawableAmountInNXM, withdrawableUntilIndex);
  // }
}
