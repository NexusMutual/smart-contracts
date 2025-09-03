// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IAssessments.sol";
import "../../generic/AssessmentGeneric.sol";

contract CLMockAssessment is AssessmentGeneric {

  mapping(uint claimId => uint) public _productTypeForClaimId;
  mapping(uint claimId => Assessment) public _assessments;

  function startAssessment(uint claimId, uint productTypeId, uint) external override {
    _productTypeForClaimId[claimId] = productTypeId;
  }

  function getAssessment(uint claimId) external view override returns(Assessment memory assessment) {
    return _assessments[claimId];
  }

  function setAssessment(uint claimId, Assessment memory assessment) external {
    _assessments[claimId] = assessment;
  }
}
