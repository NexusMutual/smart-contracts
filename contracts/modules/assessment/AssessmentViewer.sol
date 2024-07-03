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
}
