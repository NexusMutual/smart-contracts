// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {INXMMaster} from "../../interfaces/INXMMaster.sol";
import {IAssessment} from "../../interfaces/IAssessment.sol";
import {IAssessmentViewer} from "../../interfaces/IAssessmentViewer.sol";

contract AssessmentViewer is IAssessmentViewer {

  INXMMaster public immutable master;

  constructor(INXMMaster _master) {
    master = _master;
  }

  function assessment() public view returns (IAssessment) {
    return IAssessment(master.contractAddresses("AS"));
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

  function isStakeLocked(address member) external view returns (bool stakeLocked, uint stakeLockupExpiry) {

    Vote[] memory votes = votesOf[member];
    if (votes.length == 0) return (false, 0);

    Vote memory vote = votes[votes.length - 1];
    stakeLockupExpiry = vote.timestamp + uint(config.stakeLockupPeriodInDays) * 1 days;
    stakeLocked = block.timestamp > stakeLockupExpiry;
  }
}
