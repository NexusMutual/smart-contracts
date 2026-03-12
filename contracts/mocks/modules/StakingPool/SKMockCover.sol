// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/CoverGeneric.sol";

contract SKMockCover is CoverGeneric {

  uint public constant _globalCapacityRatio = 20000;
  uint public constant _globalRewardsRatio = 5000;

  mapping(uint => address) public stakingPool;

  function getGlobalRewardsRatio() public override pure returns (uint) {
    return _globalRewardsRatio;
  }

  function getGlobalCapacityRatio() public override pure returns (uint) {
    return _globalCapacityRatio;
  }

  function getGlobalCapacityAndPriceRatios() public override pure returns (uint, uint) {
    return (_globalCapacityRatio, DEFAULT_MIN_PRICE_RATIO);
  }

  function setStakingPool(address addr, uint id) public {
    stakingPool[id] = addr;
  }
}
