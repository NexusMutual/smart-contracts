// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../interfaces/IAssessment.sol";

library AssessmentLib {
  function _getPollStatus(IAssessment.Poll memory poll)
  internal view returns (IAssessment.PollStatus) {
    if (block.timestamp < poll.end) {
      return IAssessment.PollStatus.PENDING;
    }
    if (poll.accepted > poll.denied) {
      return IAssessment.PollStatus.ACCEPTED;
    }
    return IAssessment.PollStatus.DENIED;
  }
}
