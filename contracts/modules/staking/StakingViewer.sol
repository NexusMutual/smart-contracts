// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICover.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPoolFactory.sol";

import "../../libraries/StakingPoolLibrary.sol";
import "../../libraries/UncheckedMath.sol";

contract StakingViewer {
  using UncheckedMath for uint;

  struct StakingPoolDetails {
    uint poolId;
    bool isPrivatePool;
    address manager;
    uint8 poolFee;
    uint8 maxPoolFee;
    uint activeStake;
    uint currentAPY;
  }

  struct StakingPeriod {
    uint trancheId;
    uint stake;
  }

  struct StakerDetailsPerPool {
    uint poolId;
    uint totalActiveStake;
    uint totalExpiredStake;
    uint withdrawableRewards;
//    StakingPeriod[] stakingPeriodDetails;
  }

  INXMMaster internal immutable master;
  IStakingNFT public immutable stakingNFT;
  IStakingPoolFactory public immutable stakingPoolFactory;

  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8;
  uint public constant ONE_NXM = 1 ether;
  uint public constant FIRST_TRANCHE_ID = 212;  // To be updated when we launch

  constructor(
    INXMMaster _master,
    IStakingNFT _stakingNFT,
    IStakingPoolFactory _stakingPoolFactory
  ) {
    master = _master;
    stakingNFT = _stakingNFT;
    stakingPoolFactory = _stakingPoolFactory;
  }

  function cover() internal view returns (ICover) {
    return ICover(master.contractAddresses('CO'));
  }

  function stakingPool(uint poolId) public view returns (IStakingPool) {
    return IStakingPool(
      StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
    );
  }

  /* ========== Staking Pools Details ========== */

  function getStakingPoolDetailsByPoolId(
    uint poolId
  ) public view returns (StakingPoolDetails memory stakingPoolDetails) {
    IStakingPool pool = stakingPool(poolId);

    stakingPoolDetails.poolId = poolId;
    stakingPoolDetails.isPrivatePool = pool.isPrivatePool();
    stakingPoolDetails.manager = pool.manager();
    stakingPoolDetails.poolFee = pool.poolFee();
    stakingPoolDetails.maxPoolFee = pool.maxPoolFee();
    stakingPoolDetails.activeStake = pool.activeStake();
    stakingPoolDetails.currentAPY =
      pool.activeStake() != 0
        ? pool.rewardPerSecond() * 365 days / pool.activeStake()
        : 0;

    return stakingPoolDetails;
  }

  function getStakingPoolDetailsByTokenId(
    uint tokenId
  ) public view returns (StakingPoolDetails memory stakingPoolDetails) {
    return getStakingPoolDetailsByPoolId(
      stakingNFT.stakingPoolOf(tokenId)
    );
  }

  function getAllStakingPools() public view returns (StakingPoolDetails[] memory stakingPools) {
    uint poolsCount = stakingPoolFactory.stakingPoolCount();
    stakingPools = new StakingPoolDetails[](poolsCount);

    for (uint i = 0; i < poolsCount; i++) {
      stakingPools[i] = getStakingPoolDetailsByPoolId(i);
    }

    return stakingPools;
  }

  function getStakingPoolsByTokenIds(
    uint[] memory tokenIds
  ) public view returns (StakingPoolDetails[] memory stakingPools) {

    for (uint i = 0; i < tokenIds.length; i++) {
      stakingPools[i] = getStakingPoolDetailsByTokenId(tokenIds[i]);
    }

    return stakingPools;
  }

  /* ========== Staker Details ========== */

  function getStakerDetailsByTokenId(
    uint tokenId
  ) public view returns (StakerDetailsPerPool memory stakerDetails) {

    uint poolId = stakingNFT.stakingPoolOf(tokenId);
    IStakingPool pool = stakingPool(poolId);

    uint firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint totalActiveStake = 0;
    uint withdrawableRewards = 0;

    // Active tranches
    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
      (
        uint lastAccNxmPerRewardShare,
        uint pendingRewards,
        uint stakeShares,
        uint rewardsShares
      ) = pool.deposits(tokenId, firstActiveTrancheId + i);

      totalActiveStake +=
        stakingPool(poolId).activeStake() *
        stakeShares /
        stakingPool(poolId).stakeSharesSupply();

      withdrawableRewards += pendingRewards;
      withdrawableRewards +=
        (pool.accNxmPerRewardsShare().uncheckedSub(lastAccNxmPerRewardShare)) * rewardsShares / ONE_NXM;
    }

    // Expired tranches
    uint totalExpiredStake = 0;

    for (uint i = FIRST_TRANCHE_ID; i < firstActiveTrancheId; i++) {
      (
        uint lastAccNxmPerRewardShare,
        uint pendingRewards,
        uint stakeShares,
        uint rewardsShares
      ) = pool.deposits(tokenId, i);

      (
        uint accNxmPerRewardShareAtExpiry,
        uint stakeAmountAtExpiry,
        uint stakeShareSupplyAtExpiry
      ) = pool.expiredTranches(i);

      stakeShareSupplyAtExpiry != 0
        ? totalExpiredStake += stakeAmountAtExpiry * stakeShares / stakeShareSupplyAtExpiry
        : 0;

      withdrawableRewards += pendingRewards;
      withdrawableRewards +=
        (accNxmPerRewardShareAtExpiry.uncheckedSub(lastAccNxmPerRewardShare)) * rewardsShares / ONE_NXM;
    }

    stakerDetails.poolId = poolId;
    stakerDetails.totalActiveStake = totalActiveStake;
    stakerDetails.totalExpiredStake = totalExpiredStake;
    stakerDetails.withdrawableRewards = withdrawableRewards;

    return stakerDetails;
  }
}
