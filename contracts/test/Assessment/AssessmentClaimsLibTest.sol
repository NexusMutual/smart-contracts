// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "../../libraries/Assessment/AssessmentClaimsLib.sol";

contract AssessmentClaimsLibTest {
  function _getExpectedClaimPayoutNXM (IAssessment.ClaimDetails memory details)
  external pure returns (uint) {
    return AssessmentClaimsLib._getExpectedClaimPayoutNXM(details);
  }
}
