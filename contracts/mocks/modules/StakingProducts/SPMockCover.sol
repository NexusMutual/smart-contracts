// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingPoolFactory.sol";
import "../../generic/CoverGeneric.sol";

contract SPMockCover is CoverGeneric {

  uint public constant GLOBAL_CAPACITY_RATIO = 20000;
  uint public constant GLOBAL_REWARDS_RATIO = 5000;

  ICoverNFT public _coverNFT;
  IStakingNFT public _stakingNFT;
  IStakingPoolFactory public _stakingPoolFactory;
  address public _stakingPoolImplementation;

  constructor(
    ICoverNFT coverNFTAddress,
    IStakingNFT stakingNFTAddress,
    IStakingPoolFactory stakingPoolFactoryAddress,
    address stakingPoolImplementationAddress,
    address /* _coverProducts */
  ) {
    // in constructor we only initialize immutable fields
    _coverNFT = coverNFTAddress;
    _stakingNFT = stakingNFTAddress;
    _stakingPoolFactory = stakingPoolFactoryAddress;
    _stakingPoolImplementation = stakingPoolImplementationAddress;
  }

  function getDefaultMinPriceRatio() public override pure returns (uint) {
    return DEFAULT_MIN_PRICE_RATIO;
  }

  function getGlobalCapacityRatio() public override pure returns (uint) {
    return GLOBAL_CAPACITY_RATIO;
  }

  function getGlobalCapacityAndPriceRatios() public override pure returns (uint, uint) {
    return (GLOBAL_CAPACITY_RATIO, DEFAULT_MIN_PRICE_RATIO);
  }

  function stakingPoolImplementation() public override view returns (address) {
    return _stakingPoolImplementation;
  }
}
