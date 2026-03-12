// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ICompleteStakingPoolFactory.sol";
import "../../generic/CoverGeneric.sol";

contract CPMockCover is CoverGeneric {

  ICompleteStakingPoolFactory public immutable _stakingPoolFactory;

  constructor (address stakingPoolFactoryAddress) {
    _stakingPoolFactory = ICompleteStakingPoolFactory(stakingPoolFactoryAddress);
  }

  function getDefaultMinPriceRatio() public override pure returns (uint) {
    return DEFAULT_MIN_PRICE_RATIO;
  }

  function stakingPoolFactory() external override view returns (address) {
    return address(_stakingPoolFactory);
  }
}
