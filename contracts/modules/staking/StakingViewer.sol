// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../abstract/Multicall.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../libraries/StakingPoolLibrary.sol";
import "../../libraries/UncheckedMath.sol";

contract StakingViewer is Multicall {
  using UncheckedMath for uint;

  struct Pool {
    uint poolId;
    bool isPrivatePool;
    address manager;
    uint poolFee;
    uint maxPoolFee;
    uint activeStake;
    uint currentAPY;
  }

  struct StakingProduct {
    uint productId;
    uint lastEffectiveWeight;
    uint targetWeight;
    uint targetPrice;
    uint bumpedPrice;
  }

  struct Deposit {
    uint tokenId;
    uint trancheId;
    uint stake;
    uint reward;
  }

  struct Token {
    uint poolId;
    uint activeStake;
    uint expiredStake;
    uint rewards;
    Deposit[] deposits;
  }

  struct TokenPoolMap {
    uint poolId;
    uint tokenId;
  }

  struct AggregatedTokens {
    uint totalActiveStake;
    uint totalExpiredStake;
    uint totalRewards;
  }

  struct AggregatedRewards {
    uint totalRewards;
    uint[] trancheIds;
  }

  INXMMaster public immutable master;
  IStakingNFT public immutable stakingNFT;
  IStakingPoolFactory public immutable stakingPoolFactory;

  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8;
  uint public constant ONE_NXM = 1 ether;
  uint public constant TRANCHE_ID_AT_DEPLOY = 213; // first active tranche at deploy time
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

  /* ========== STAKING POOL ========== */

  function getPool(uint poolId) public view returns (Pool memory pool) {

    IStakingPool _stakingPool = stakingPool(poolId);

    pool.poolId = poolId;
    pool.isPrivatePool = _stakingPool.isPrivatePool();
    pool.manager = _stakingPool.manager();
    pool.poolFee = _stakingPool.poolFee();
    pool.maxPoolFee = _stakingPool.maxPoolFee();
    pool.activeStake = _stakingPool.activeStake();
    pool.currentAPY =
      _stakingPool.activeStake() != 0
        ? _stakingPool.rewardPerSecond() * 365 days / _stakingPool.activeStake()
        : 0;

    return pool;
  }

  function getPools(uint[] memory poolIds) public view returns (Pool[] memory pools) {

    uint poolsLength = poolIds.length;
    pools = new Pool[](poolsLength);

    for (uint i = 0; i < poolsLength; i++) {
      pools[i] = getPool(poolIds[i]);
    }

    return pools;
  }

  function getAllPools() public view returns (Pool[] memory pools) {

    uint poolCount = stakingPoolFactory.stakingPoolCount();
    pools = new Pool[](poolCount);

    for (uint i = 0; i < poolCount; i++) {
      pools[i] = getPool(i);
    }

    return pools;
  }

  /* ========== PRODUCTS ========== */

  function getPoolProducts(uint poolId) public view returns (StakingProduct[] memory products) {

    uint stakedProductsCount = 0;
    uint coverProductCount = cover().productsCount();
    StakingProduct[] memory stakedProductsQueue = new StakingProduct[](coverProductCount);

    for (uint i = 0; i < coverProductCount; i++) {
      (
        uint lastEffectiveWeight,
        uint targetWeight,
        uint targetPrice,
        uint bumpedPrice,
        uint bumpedPriceUpdateTime
      ) = stakingPool(poolId).products(i);

      if (targetWeight == 0 && lastEffectiveWeight == 0 && bumpedPriceUpdateTime == 0) {
        continue;
      }

      StakingProduct memory product;
      product.productId = i;
      product.lastEffectiveWeight = lastEffectiveWeight;
      product.targetWeight = targetWeight;
      product.bumpedPrice = bumpedPrice;
      product.targetPrice = targetPrice;

      stakedProductsQueue[stakedProductsCount] = product;
      stakedProductsCount++;
    }

    products = new StakingProduct[](stakedProductsCount);

    for (uint i = 0; i < stakedProductsCount; i++) {
      products[i] = stakedProductsQueue[i];
    }

    return products;
  }

  /* ========== TOKENS AND DEPOSITS ========== */

  function getStakingPoolsOf(
    uint[] memory tokenIds
  ) public view returns (TokenPoolMap[] memory tokenPools) {

    tokenPools = new TokenPoolMap[](tokenIds.length);

    for (uint i = 0; i < tokenIds.length; i++) {
      uint tokenId = tokenIds[i];
      uint poolId = stakingNFT.stakingPoolOf(tokenId);
      tokenPools[i] = TokenPoolMap(poolId, tokenId);
    }

    return tokenPools;
  }

  function _getToken(uint poolId, uint tokenId) public view returns (Token memory token) {

    IStakingPool _stakingPool = stakingPool(poolId);

    uint firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint depositCount;

    Deposit[] memory depositsQueue;
    {
      uint maxTranches = firstActiveTrancheId - TRANCHE_ID_AT_DEPLOY + MAX_ACTIVE_TRANCHES;
      depositsQueue = new Deposit[](maxTranches);
    }

    // Active tranches

    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
      (
        uint lastAccNxmPerRewardShare,
        uint pendingRewards,
        uint stakeShares,
        uint rewardsShares
      ) = _stakingPool.deposits(tokenId, firstActiveTrancheId + i);

      if (rewardsShares == 0) {
        continue;
      }

      Deposit memory deposit;
      deposit.tokenId = tokenId;
      deposit.trancheId = firstActiveTrancheId + i;

      uint stake =
        _stakingPool.activeStake()
        * stakeShares
        / _stakingPool.stakeSharesSupply();

      uint newRewardPerShare = _stakingPool.accNxmPerRewardsShare().uncheckedSub(lastAccNxmPerRewardShare);
      uint reward = pendingRewards + newRewardPerShare * rewardsShares / ONE_NXM;

      deposit.stake = stake;
      deposit.reward = reward;
      depositsQueue[depositCount++] = deposit;

      token.activeStake += stake;
      token.rewards += reward;
    }

    // Expired tranches

    for (uint i = TRANCHE_ID_AT_DEPLOY; i < firstActiveTrancheId; i++) {
      (
        uint lastAccNxmPerRewardShare,
        uint pendingRewards,
        uint stakeShares,
        uint rewardsShares
      ) = _stakingPool.deposits(tokenId, i);

      if (rewardsShares == 0) {
        continue;
      }

      (
        uint accNxmPerRewardShareAtExpiry,
        uint stakeAmountAtExpiry,
        uint stakeShareSupplyAtExpiry
      ) = _stakingPool.expiredTranches(i);

      // to avoid this the workaround is to call processExpirations as the first call in the
      // multicall batch. this will require the call to be explicitly be static in js:
      // viewer.callStatic.multicall(...)
      require(stakeShareSupplyAtExpiry != 0, "Tranche expired but expirations were not processed");

      Deposit memory deposit;
      deposit.stake = stakeAmountAtExpiry * stakeShares / stakeShareSupplyAtExpiry;

      uint newRewardPerShare = accNxmPerRewardShareAtExpiry.uncheckedSub(lastAccNxmPerRewardShare);
      deposit.reward = pendingRewards + newRewardPerShare * rewardsShares / ONE_NXM;

      deposit.tokenId = tokenId;
      deposit.trancheId = i;

      depositsQueue[depositCount] = deposit;
      depositCount++;

      token.expiredStake += deposit.stake;
      token.rewards += deposit.reward;
    }

    token.poolId = poolId;
    token.deposits = new Deposit[](depositCount);

    for (uint i = 0; i < depositCount; i++) {
      token.deposits[i] = depositsQueue[i];
    }

    return token;
  }

  function getToken(uint tokenId) public view returns (Token memory token) {
    uint poolId = stakingNFT.stakingPoolOf(tokenId);
    return _getToken(poolId, tokenId);
  }

  function getTokens(uint[] memory tokenIds) public view returns (Token[] memory tokens) {

    tokens = new Token[](tokenIds.length);

    for (uint i = 0; i < tokenIds.length; i++) {
      uint poolId = stakingNFT.stakingPoolOf(tokenIds[i]);
      tokens[i] = _getToken(poolId, tokenIds[i]);
    }

    return tokens;
  }

  function getAggregatedTokens(
    uint[] calldata tokenIds
  ) public view returns (AggregatedTokens memory aggregated) {

    for (uint i = 0; i < tokenIds.length; i++) {
      Token memory token = getToken(tokenIds[i]);
      aggregated.totalActiveStake += token.activeStake;
      aggregated.totalExpiredStake += token.expiredStake;
      aggregated.totalRewards += token.rewards;
    }

    return aggregated;
  }

  function getManagerRewards (uint poolId) public view returns (AggregatedRewards memory managerRewards) {

    Token memory token = _getToken(poolId, 0);

    managerRewards.totalRewards = token.rewards;
    managerRewards.trancheIds = new uint[](token.deposits.length);

    for (uint i = 0; i < token.deposits.length; i++) {
      managerRewards.trancheIds[i] = token.deposits[i].trancheId;
    }

    return managerRewards;
  }
}
