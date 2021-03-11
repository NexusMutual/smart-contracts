pragma solidity ^0.5.0;

import "../../modules/token/TokenController.sol";
import "../../modules/token/NXMToken.sol";

contract DisposableTokenController is TokenController {

  function initialize(
    address _masterAddress,
    address _tokenAddress,
    address _pooledStakingAddress,
    uint _claimsAssessmentLockTime,
    uint _claimSubmissionGracePeriod
  ) external {

    token = NXMToken(_tokenAddress);
    token.changeOperator(address(this));

    changeMasterAddress(_masterAddress);
    pooledStaking = IPooledStaking(_pooledStakingAddress);
    minCALockTime = _claimsAssessmentLockTime;
    claimSubmissionGracePeriod = _claimSubmissionGracePeriod;

  }

}
