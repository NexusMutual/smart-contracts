// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {IAssessment} from "../../interfaces/IAssessment.sol";
import {IAssessmentViewer} from "../../interfaces/IAssessmentViewer.sol";
import {INXMMaster} from "../../interfaces/INXMMaster.sol";
import {INXMToken} from "../../interfaces/INXMToken.sol";

contract AssessmentViewer is IAssessmentViewer {

  INXMMaster public immutable master;
  INXMToken public immutable nxmToken;
  

  constructor(INXMMaster _master, INXMToken _nxmToken) {
    master = _master;
    nxmToken = _nxmToken;
  }

  function assessment() public view returns (IAssessment) {
    return IAssessment(master.getLatestAddress("AS"));
  }

  function getRewards(address user) external view returns (AssessmentRewards memory) {

    (
      uint totalPendingAmountInNXM,
      uint withdrawableAmountInNXM,
      uint withdrawableUntilIndex
    ) = assessment().getRewards(user);

    return AssessmentRewards({
      totalPendingAmountInNXM: totalPendingAmountInNXM,
      withdrawableAmountInNXM: withdrawableAmountInNXM,
      withdrawableUntilIndex: withdrawableUntilIndex
    });
  }

  function isStakeLocked(address member) external view returns (bool stakeLocked) {

    IAssessment _assessment = assessment();

    if (block.timestamp < nxmToken.isLockedForMV(member)) {
      return true; // NXM is locked for voting in governance
    }

    uint voteCount = _assessment.getVoteCountOfAssessor(member);
    if (voteCount == 0) return false;

    (,, uint32 timestamp,) = _assessment.votesOf(member, voteCount - 1);
    (, uint8 stakeLockupPeriodInDays,,) = _assessment.config();

    uint stakeLockupExpiry = timestamp + stakeLockupPeriodInDays * 1 days;
    stakeLocked = stakeLockupExpiry > block.timestamp;
  }
}
