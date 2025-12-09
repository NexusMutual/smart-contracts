// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {Registry} from "@symbioticfi/core/src/contracts/common/Registry.sol";

import {IDefaultStakerRewardsFactory} from "../../interfaces/symbiotic/IDefaultStakerRewardsFactory.sol";

import {DefaultStakerRewards} from "./DefaultStakerRewards.sol";

contract DefaultStakerRewardsFactory is Registry, IDefaultStakerRewardsFactory {
  using Clones for address;

  address private immutable STAKER_REWARDS_IMPLEMENTATION;

  constructor(address stakerRewardsImplementation) {
    STAKER_REWARDS_IMPLEMENTATION = stakerRewardsImplementation;
  }

  /**
   * @inheritdoc IDefaultStakerRewardsFactory
   */
  function create(DefaultStakerRewards.InitParams calldata params) external returns (address) {
    address stakerRewards = STAKER_REWARDS_IMPLEMENTATION.cloneDeterministic(
      keccak256(abi.encode(totalEntities(), params))
    );
    DefaultStakerRewards(stakerRewards).initialize(params);

    _addEntity(stakerRewards);

    return stakerRewards;
  }
}
