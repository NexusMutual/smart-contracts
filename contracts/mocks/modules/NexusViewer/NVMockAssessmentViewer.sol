// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {IAssessment} from "../../../interfaces/IAssessment.sol";
import {IAssessmentViewer} from "../../../interfaces/IAssessmentViewer.sol";
import {INXMMaster} from "../../../interfaces/INXMMaster.sol";
import {INXMToken} from "../../../interfaces/INXMToken.sol";

contract NVMockAssessmentViewer is IAssessmentViewer {

  bool stakeLocked;
  AssessmentRewards assessmentRewards;

  /* ========== SETTERS ========== */

  function setStakeLocked(bool _stakeLocked) external {
    stakeLocked = _stakeLocked;
  }

  function setRewards(
    uint _totalPendingAmountInNXM,
    uint _withdrawableAmountInNXM,
    uint _withdrawableUntilIndex
  ) external {
    assessmentRewards = AssessmentRewards({
      totalPendingAmountInNXM: _totalPendingAmountInNXM,
      withdrawableAmountInNXM: _withdrawableAmountInNXM,
      withdrawableUntilIndex: _withdrawableUntilIndex
    });
  }

  /* ========== VIEWS ========== */

  function isStakeLocked(address) external view returns (bool) {
    return stakeLocked;
  }

  function getRewards(address) external view returns (AssessmentRewards memory) {
    return assessmentRewards;
  }

  /* ========== NOT YET IMPLEMENTED ========== */

  function assessment() public pure returns (IAssessment) {
    revert("assessment not yet implemented");
  }
}
