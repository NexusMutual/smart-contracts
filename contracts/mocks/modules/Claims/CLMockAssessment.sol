// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IAssessment.sol";
import "../../generic/AssessmentGeneric.sol";

contract CLMockAssessment is AssessmentGeneric {

  mapping(uint claimId => AssessmentStatus) public _status;
  mapping(uint claimId => uint) public _payoutRedemptionEnd;
  mapping(uint claimId => uint) public _cooldownEnd;
  mapping(uint claimId => uint) public _productTypeForClaimId;

  function startAssessment(uint claimId, uint productTypeId) external override {
    _productTypeForClaimId[claimId] = productTypeId;
  }

  function getAssessmentResult(uint claimId) external override view returns (AssessmentStatus, uint, uint) {
    return(_status[claimId], _payoutRedemptionEnd[claimId], _cooldownEnd[claimId]);
  }

  function setAssessmentResult(uint claimId, AssessmentStatus status, uint payoutRedemptionEnd, uint cooldownEnd) external {
    _status[claimId] = status;
    _payoutRedemptionEnd[claimId] = payoutRedemptionEnd;
    _cooldownEnd[claimId] = cooldownEnd;
  }

}
