// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../interfaces/IAssessment.sol";
import "../libraries/AssessmentLib.sol";

contract AssessmentLibTest {
  function _getPollStatus(IAssessment.Poll memory poll) external view
  returns (IAssessment.PollStatus) {
    return AssessmentLib._getPollStatus(poll);
  }

}
