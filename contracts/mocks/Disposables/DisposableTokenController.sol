// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/INXMToken.sol";
import "../../modules/token/TokenController.sol";

contract DisposableTokenController is TokenController {

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
}
