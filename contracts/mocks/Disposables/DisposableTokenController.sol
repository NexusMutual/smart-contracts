// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../interfaces/INXMToken.sol";
import "../../modules/token/TokenController.sol";

contract DisposableTokenController is TokenController {

  function initialize(
    address _masterAddress,
    address _tokenAddress,
    address _pooledStakingAddress,
    uint _claimsAssessmentLockTime,
    uint _claimSubmissionGracePeriod
  ) external {

    token = INXMToken(_tokenAddress);
    token.changeOperator(address(this));

    changeMasterAddress(_masterAddress);
    pooledStaking = IPooledStaking(_pooledStakingAddress);
    minCALockTime = _claimsAssessmentLockTime;
    claimSubmissionGracePeriod = _claimSubmissionGracePeriod;

  }

  function addToWhitelist(address _member) public {
    token.addToWhiteList(_member);
  }
}
