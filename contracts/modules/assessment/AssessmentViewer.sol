// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {IAssessment} from "../../interfaces/IAssessment.sol";
import {IAssessmentViewer} from "../../interfaces/IAssessmentViewer.sol";
import {INXMMaster} from "../../interfaces/INXMMaster.sol";
import {INXMToken} from "../../interfaces/INXMToken.sol";

/// @title AssessmentViewer Contract
/// @notice This contract is viewer contract for the Assessment module
contract AssessmentViewer is IAssessmentViewer {

  INXMMaster public immutable master;

  constructor(INXMMaster _master) {
    master = _master;
  }

  function assessment() public view returns (IAssessment) {
    return IAssessment(master.getLatestAddress("AS"));
  }

  /// @notice Get rewards details for a member
  /// @param member The address of the member
  /// @return AssessmentRewards structure containing reward details
  function getRewards(address member) external view returns (AssessmentRewards memory) {

    (
      uint totalPendingAmountInNXM,
      uint withdrawableAmountInNXM,
      uint withdrawableUntilIndex
    ) = assessment().getRewards(member);

    return AssessmentRewards({
      totalPendingAmountInNXM: totalPendingAmountInNXM,
      withdrawableAmountInNXM: withdrawableAmountInNXM,
      withdrawableUntilIndex: withdrawableUntilIndex
    });
  }

  /// @notice Check if the stake of a member is locked and when it will be unlocked
  /// @param member The address of the member
  /// @return AssessmentStakeLockedState structure containing locked stake details
  function getStakeLocked(address member) external view returns (AssessmentStakeLockedState memory) {

    IAssessment _assessment = assessment();

    uint voteCount = _assessment.getVoteCountOfAssessor(member);

    if (voteCount == 0) {
      return AssessmentStakeLockedState({ isStakeLocked: false, stakeLockupExpiry: 0 });
    }

    (,, uint timestamp,) = _assessment.votesOf(member, voteCount - 1);
    (, uint stakeLockupPeriodInDays,,) = _assessment.config();

    uint stakeLockupExpiry = timestamp + stakeLockupPeriodInDays * 1 days;
    bool isStakeLocked = stakeLockupExpiry > block.timestamp;

    return AssessmentStakeLockedState({
      isStakeLocked: isStakeLocked,
      stakeLockupExpiry: stakeLockupExpiry
    });

  }
}
