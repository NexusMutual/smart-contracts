// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/INXMToken.sol";
import "../../modules/token/TokenController.sol";

contract DisposableTokenController is TokenController {

  constructor(address quotationDataAddress) TokenController(quotationDataAddress) {}

  function initialize(
    address _masterAddress,
    address _tokenAddress,
    address _pooledStakingAddress,
    address _assessmentAddress
  ) external {

    token = INXMToken(_tokenAddress);
    token.changeOperator(address(this));

    changeMasterAddress(_masterAddress);
    pooledStaking = IPooledStaking(_pooledStakingAddress);
    assessment = IAssessment(_assessmentAddress);

  }

  function addToWhitelist(address _member) public override {
    token.addToWhiteList(_member);
  }

  function lock(
    address _of,
    bytes32 _reason,
    uint256 _amount,
    uint256 _time
  ) external returns (bool) {
    // If tokens are already locked, then functions extendLock or
    // increaseLockAmount should be used to make any changes
    _lock(_of, _reason, _amount, _time);
    return true;
  }
}
