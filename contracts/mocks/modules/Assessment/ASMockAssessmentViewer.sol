// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {IAssessment} from "../../../interfaces/IAssessment.sol";
import {IAssessmentViewer} from "../../../interfaces/IAssessmentViewer.sol";
import {INXMMaster} from "../../../interfaces/INXMMaster.sol";
import {INXMToken} from "../../../interfaces/INXMToken.sol";

contract ASMockAssessmentViewer is IAssessmentViewer {

  bool stakeLocked;
  
  function setStakeLocked(bool _stakeLocked) external {
    stakeLocked = _stakeLocked;
  }

  function isStakeLocked(address) external view returns (bool) {
    return stakeLocked;
  }

  /* ========== NOT YET IMPLEMENTED ========== */

  function assessment() public pure returns (IAssessment) {
    revert("assessment not yet implemented");
  }

  function getRewards(address) external pure returns (AssessmentRewards memory) {
    revert("getRewards not yet implemented");
  }

}
