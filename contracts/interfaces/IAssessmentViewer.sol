// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

interface IAssessmentViewer {

  struct AssessmentRewards {
    uint totalPendingAmountInNXM;
    uint withdrawableAmountInNXM;
    uint withdrawableUntilIndex;
  }

  struct AssessmentStakeLockedState {
    bool isStakeLocked;
    uint stakeLockupExpiry;
  }

  function getRewards(address user) external view returns (AssessmentRewards memory);

  function getStakeLocked(address member) external view returns (AssessmentStakeLockedState memory);
}
