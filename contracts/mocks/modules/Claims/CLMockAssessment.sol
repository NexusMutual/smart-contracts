// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IAssessment.sol";
import "../../generic/AssessmentGeneric.sol";

contract CLMockAssessment is AssessmentGeneric {

  mapping(uint claimId => uint) public _cooldown;
  mapping(uint claimId => AssessmentStatus) public _status;
  mapping(uint claimId => uint16) public _productTypeForClaimId;

  function startAssessment(uint claimId, uint16 productTypeId) external override {
    _productTypeForClaimId[claimId] = productTypeId;
  }

  function getAssessmentResult(uint claimId) external override view returns (uint, AssessmentStatus) {
    return(_cooldown[claimId], _status[claimId]);
  }

  function setAssessmentResult(uint claimId, uint cooldown, AssessmentStatus status) external {
    _cooldown[claimId] = cooldown;
    _status[claimId] = status;
  }

}
