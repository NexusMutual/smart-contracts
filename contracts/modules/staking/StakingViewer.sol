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

  struct StakingPoolOverview {
    uint poolId;
    bool isPrivatePool;
    address manager;
    uint8 poolFee;
    uint8 maxPoolFee;
    uint activeStake;
    uint currentAPY;
  }

  struct StakingPoolProduct {
    uint productId;
    uint16 lastEffectiveWeight;
    uint8 targetWeight;
    uint96 targetPrice;
    uint96 bumpedPrice;
  }

  struct StakingPoolProductsDetails {
    StakingPoolOverview poolOverview;
    StakingPoolProduct[] products;
  }

  struct StakingPeriod {
    uint tokenId;
    uint trancheId;
    uint stake;
  }

  struct StakerOverview {
    uint poolId;
    uint activeStake;
    uint expiredStake;
    uint withdrawableRewards;
//    Rewards[] withdrawableRewards;
    StakingPeriod[] stakingPeriods;
  }

  struct StakerDetails {
    uint totalActiveStake;
    uint totalExpiredStake;
    uint totalWithdrawableRewards;
  }

  struct Rewards {
    uint withdrawableRewards;
    uint[] trancheIds;
  }

  INXMMaster internal immutable master;
  IStakingNFT public immutable stakingNFT;
  IStakingPoolFactory public immutable stakingPoolFactory;

  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8;
  uint public constant ONE_NXM = 1 ether;
  uint public constant FIRST_TRANCHE_ID = 212;  // To be updated when we launch
  uint public constant MAX_UINT = type(uint).max;

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

  /* ========== STAKING POOL FUNCTIONS ========== */

  function getStakingPoolOverviewByPoolId(
    uint poolId
  ) public view returns (StakingPoolOverview memory stakingPoolOverview) {
    IStakingPool pool = stakingPool(poolId);

    stakingPoolOverview.poolId = poolId;
    stakingPoolOverview.isPrivatePool = pool.isPrivatePool();
    stakingPoolOverview.manager = pool.manager();
    stakingPoolOverview.poolFee = pool.poolFee();
    stakingPoolOverview.maxPoolFee = pool.maxPoolFee();
    stakingPoolOverview.activeStake = pool.activeStake();
    stakingPoolOverview.currentAPY =
      pool.activeStake() != 0
        ? pool.rewardPerSecond() * 365 days / pool.activeStake()
        : 0;

    return stakingPoolOverview;
  }

  function getStakingPoolOverviewByTokenId(
    uint tokenId
  ) public view returns (StakingPoolOverview memory stakingPoolOverview) {
    return getStakingPoolOverviewByPoolId(
      stakingNFT.stakingPoolOf(tokenId)
    );
  }

  function getAllStakingPools() public view returns (StakingPoolOverview[] memory stakingPools) {
    uint poolsCount = stakingPoolFactory.stakingPoolCount();
    stakingPools = new StakingPoolOverview[](poolsCount);

    for (uint i = 0; i < poolsCount; i++) {
      stakingPools[i] = getStakingPoolOverviewByPoolId(i);
    }

    return stakingPools;
  }

  function getStakingPoolsByTokenIds(
    uint[] memory tokenIds
  ) public view returns (StakingPoolOverview[] memory stakingPools) {

    for (uint i = 0; i < tokenIds.length; i++) {
      stakingPools[i] = getStakingPoolOverviewByTokenId(tokenIds[i]);
    }

    return stakingPools;
  }

  function getStakingPoolWithProductsByPoolId(
    uint poolId
  ) public view returns (StakingPoolProductsDetails memory stakingPoolDetails) {

    uint allProductsCount = cover().productsCount();
    StakingPoolProduct[] memory stakedProductsQueue = new StakingPoolProduct[](allProductsCount);
    uint stakedProductsCount = 0;

    for (uint i = 0; i < allProductsCount; i++) {
      (
        uint16 lastEffectiveWeight,
        uint8 targetWeight,
        uint96 targetPrice,
        uint96 bumpedPrice,
        uint32 bumpedPriceUpdateTime
      ) = stakingPool(poolId).products(i);

      if (targetWeight == 0 && lastEffectiveWeight == 0 && bumpedPriceUpdateTime == 0) {
        continue;
      }

      StakingPoolProduct memory stakedProduct;
      stakedProduct.productId = i;
      stakedProduct.lastEffectiveWeight = lastEffectiveWeight;
      stakedProduct.targetWeight = targetWeight;
      stakedProduct.bumpedPrice = bumpedPrice;
      stakedProduct.targetPrice = targetPrice;

      stakedProductsQueue[stakedProductsCount] = stakedProduct;
      stakedProductsCount++;
    }

    StakingPoolProduct[] memory stakedProducts = new StakingPoolProduct[](stakedProductsCount);
    for (uint i = 0; i < stakedProductsCount; i++) {
      stakedProducts[i] = stakedProductsQueue[i];
    }

    stakingPoolDetails.poolOverview = getStakingPoolOverviewByPoolId(poolId);
    stakingPoolDetails.products = stakedProducts;

    return stakingPoolDetails;
  }

  /* ========== STAKER FUNCTIONS ========== */

  function getStakerOverviewByTokenId(
    uint tokenId
  ) public view returns (StakerOverview memory stakerOverview) {

    uint poolId = stakingNFT.stakingPoolOf(tokenId);
    IStakingPool pool = stakingPool(poolId);

    uint firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint totalActiveStake = 0;
    uint withdrawableRewards = 0;
    uint newRewardPerShare;

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

      newRewardPerShare = pool.accNxmPerRewardsShare().uncheckedSub(lastAccNxmPerRewardShare);
      withdrawableRewards += newRewardPerShare * rewardsShares / ONE_NXM;
      withdrawableRewards += pendingRewards;
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

      newRewardPerShare = accNxmPerRewardShareAtExpiry.uncheckedSub(lastAccNxmPerRewardShare);
      withdrawableRewards += newRewardPerShare * rewardsShares / ONE_NXM;
      withdrawableRewards += pendingRewards;
    }

    stakerOverview.poolId = poolId;
    stakerOverview.activeStake = totalActiveStake;
    stakerOverview.expiredStake = totalExpiredStake;
    stakerOverview.withdrawableRewards = withdrawableRewards;

    return stakerOverview;
  }

  function getStakerOverviewByPoolId(
    uint[] calldata tokenIds,
    uint poolId
  ) public view returns (StakerOverview memory stakerOverview) {
    stakerOverview.poolId = poolId;

    IStakingPool pool = stakingPool(poolId);
    uint periodsWithDepositCount = 0;

    uint firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    StakingPeriod[] memory stakingPeriodsWithDepositsQueue = new StakingPeriod[](
      firstActiveTrancheId + MAX_ACTIVE_TRANCHES
    );

    for (uint tokenId = 0; tokenId < tokenIds.length; tokenId++) {
      if (stakingNFT.stakingPoolOf(tokenIds[tokenId]) != poolId) {
        continue;
      }

      StakerOverview memory stakerOverviewForToken = getStakerOverviewByTokenId(tokenIds[tokenId]);
      stakerOverview.activeStake += stakerOverviewForToken.activeStake;
      stakerOverview.expiredStake += stakerOverviewForToken.expiredStake;
      stakerOverview.withdrawableRewards += stakerOverviewForToken.withdrawableRewards;

      // Calculate staking periods that still have a deposit (both expired and active)
      for (
        uint trancheId = FIRST_TRANCHE_ID;
        trancheId < firstActiveTrancheId + MAX_ACTIVE_TRANCHES;
        trancheId++
      ) {
        (,, uint stakeShares,) = pool.deposits(tokenIds[tokenId], trancheId);

        if (stakeShares == 0) {
          continue;
        }

        StakingPeriod memory stakingPeriod;
        stakingPeriod.trancheId = trancheId;
        stakingPeriod.tokenId = tokenIds[tokenId];

        if (trancheId < firstActiveTrancheId) {
          (, uint stakeAmountAtExpiry,) = pool.expiredTranches(trancheId);
          stakingPeriod.stake = stakeAmountAtExpiry;
        } else {
          stakingPeriod.stake =
          stakingPool(poolId).activeStake() *
          stakeShares /
          stakingPool(poolId).stakeSharesSupply();
        }

        stakingPeriodsWithDepositsQueue[periodsWithDepositCount] = stakingPeriod;
        periodsWithDepositCount++;
      }
    }

    StakingPeriod[] memory stakingPeriodsWithDeposits = new StakingPeriod[](
      periodsWithDepositCount
    );
    for (uint i = 0; i < periodsWithDepositCount; i++) {
      stakingPeriodsWithDeposits[i] = stakingPeriodsWithDepositsQueue[i];
    }
    stakerOverview.stakingPeriods = stakingPeriodsWithDeposits;

    return stakerOverview;
  }

  function getAllStakerDetails(
    uint[] calldata tokenIds
  ) public view returns (StakerDetails memory stakerDetails) {
    for (uint i = 0; i < tokenIds.length; i++) {
      StakerOverview memory stakerOverviewForToken = getStakerOverviewByTokenId(tokenIds[i]);

      stakerDetails.totalActiveStake += stakerOverviewForToken.activeStake;
      stakerDetails.totalExpiredStake += stakerOverviewForToken.expiredStake;
      stakerDetails.totalWithdrawableRewards += stakerOverviewForToken.withdrawableRewards;
    }

    return stakerDetails;
  }

  function getPoolManagerWithdrawableRewards (uint poolId) public view returns (
    Rewards memory managerRewards
  ) {
    IStakingPool pool = stakingPool(poolId);

    uint firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint tokenId = MAX_UINT;

    uint tranchesCount = 0;
    uint withdrawableRewards = 0;
    uint newRewardPerShare;
    uint trancheRewards;

    // Use a queue as we don't have the actual size to initialize the array
    uint[] memory trancheIdsQueue = new uint[](
      firstActiveTrancheId + MAX_ACTIVE_TRANCHES - FIRST_TRANCHE_ID
    );

    // Iterate through all tranches
    for (uint i = FIRST_TRANCHE_ID; i < firstActiveTrancheId + MAX_ACTIVE_TRANCHES; i++) {
      trancheRewards = 0;
      (
        uint lastAccNxmPerRewardShare,
        uint pendingRewards,
        /* uint stakeShares */,
        uint rewardsShares
      ) = pool.deposits(tokenId, i);

      if (i < firstActiveTrancheId) { // Expired tranches
        (uint accNxmPerRewardShareAtExpiry,,) = pool.expiredTranches(i);
        newRewardPerShare = accNxmPerRewardShareAtExpiry.uncheckedSub(lastAccNxmPerRewardShare);
      } else { // Active tranches
        newRewardPerShare = pool.accNxmPerRewardsShare().uncheckedSub(lastAccNxmPerRewardShare);
      }

      // Accumulate the rewards
      withdrawableRewards += trancheRewards;

      // Store the trancheId if there are rewards in this tranche
      trancheRewards = pendingRewards + (newRewardPerShare * rewardsShares / ONE_NXM);
      if (trancheRewards != 0) {
        trancheIdsQueue[tranchesCount] = tranchesCount;
        tranchesCount++;
      }
    }

    uint[] memory trancheIds = new uint[](tranchesCount);
    for (uint i = 0; i < tranchesCount; i++) {
      trancheIds[i] = trancheIdsQueue[i];
    }

    managerRewards.withdrawableRewards = withdrawableRewards;
    managerRewards.trancheIds = trancheIds;
    return managerRewards;
  }
}
