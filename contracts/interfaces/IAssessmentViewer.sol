// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

interface IAssessmentViewer {

  struct AssessmentRewards {
    uint totalPendingAmountInNXM;
    uint withdrawableAmountInNXM;
    uint withdrawableUntilIndex;
  }

  function getRewards(address user) external view returns (AssessmentRewards memory);

  function isStakeLocked(address member) external view returns (bool stakeLocked);
}
