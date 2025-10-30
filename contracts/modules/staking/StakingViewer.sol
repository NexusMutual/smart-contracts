// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../abstract/Multicall.sol";
import "../../abstract/RegistryAware.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IRegistry.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/IStakingViewer.sol";
import "../../libraries/StakingPoolLibrary.sol";
import "../../libraries/UncheckedMath.sol";

contract StakingViewer is IStakingViewer, RegistryAware, Multicall {
  using UncheckedMath for uint;

  IStakingNFT public immutable stakingNFT;
  IStakingPoolFactory public immutable stakingPoolFactory;

  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8;
  uint public constant ONE_NXM = 1 ether;
  uint public constant TRANCHE_ID_AT_DEPLOY = 213; // first active tranche at deploy time
  uint public constant MAX_UINT = type(uint).max;

  IStakingProducts public immutable stakingProducts;
  ICoverProducts public immutable coverProducts;

  constructor(address _registry) RegistryAware(_registry) {
    stakingNFT = IStakingNFT(fetch(C_STAKING_NFT));
    stakingProducts = IStakingProducts(fetch(C_STAKING_PRODUCTS));
    coverProducts = ICoverProducts(fetch(C_COVER_PRODUCTS));
    stakingPoolFactory = IStakingPoolFactory(fetch(C_STAKING_POOL_FACTORY));
  }

  function stakingPool(uint poolId) public view returns (IStakingPool) {
    return IStakingPool(
      StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
    );
  }

  /* ========== STAKING POOL ========== */

  function getPool(uint poolId) public view returns (Pool memory pool) {

    IStakingPool _stakingPool = stakingPool(poolId);
    uint activeStake = _stakingPool.getActiveStake();

    pool.poolId = poolId;
    pool.isPrivatePool = _stakingPool.isPrivatePool();
    pool.manager = _stakingPool.manager();
    pool.poolFee = _stakingPool.getPoolFee();
    pool.maxPoolFee = _stakingPool.getMaxPoolFee();
    pool.metadataIpfsHash = stakingProducts.getPoolMetadata(poolId);
    pool.activeStake = activeStake;
    pool.currentAPY =
      activeStake != 0
        ? 1 ether * _stakingPool.getRewardPerSecond() * 365 days / activeStake
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
      pools[i] = getPool(i + 1); // poolId starts from 1
    }

    return pools;
  }

  function getProductPools(uint productId) public view returns (Pool[] memory pools) {
    uint queueSize = 0;
    uint poolCount = stakingPoolFactory.stakingPoolCount();
    Pool[] memory stakedPoolsQueue = new Pool[](poolCount);

    for (uint i = 1; i <= poolCount; i++) {
      (
        uint lastEffectiveWeight,
        uint targetWeight,
        /* uint targetPrice */,
        /* uint bumpedPrice */,
        uint bumpedPriceUpdateTime
      ) = stakingProducts.getProduct(i, productId);

      if (targetWeight == 0 && lastEffectiveWeight == 0 && bumpedPriceUpdateTime == 0) {
        continue;
      }

      Pool memory pool = getPool(i);
      stakedPoolsQueue[queueSize] = pool;
      queueSize++;
    }
    pools = new Pool[](queueSize);

    for (uint i = 0; i < queueSize; i++) {
      pools[i] = stakedPoolsQueue[i];
    }

    return pools;
  }

  /* ========== PRODUCTS ========== */

  function getPoolProducts(uint poolId) public view returns (StakingProduct[] memory products) {

    uint stakedProductsCount = 0;
    uint coverProductCount = coverProducts.getProductCount();
    StakingProduct[] memory stakedProductsQueue = new StakingProduct[](coverProductCount);
    for (uint i = 0; i < coverProductCount; i++) {
      (
        uint lastEffectiveWeight,
        uint targetWeight,
        uint targetPrice,
        uint bumpedPrice,
        uint bumpedPriceUpdateTime
      ) = stakingProducts.getProduct(poolId, i);

      if (targetWeight == 0 && lastEffectiveWeight == 0 && bumpedPriceUpdateTime == 0) {
        continue;
      }

      StakingProduct memory product;
      product.productId = i;
      product.lastEffectiveWeight = lastEffectiveWeight;
      product.targetWeight = targetWeight;
      product.bumpedPrice = bumpedPrice;
      product.targetPrice = targetPrice;
      product.bumpedPriceUpdateTime = bumpedPriceUpdateTime;

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

  function _getToken(uint poolId, uint tokenId) internal view returns (Token memory token) {

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
      ) = _stakingPool.getDeposit(tokenId, firstActiveTrancheId + i);

      if (rewardsShares == 0) {
        continue;
      }

      Deposit memory deposit;
      deposit.tokenId = tokenId;
      deposit.trancheId = firstActiveTrancheId + i;

      uint stake =
        _stakingPool.getActiveStake()
        * stakeShares
        / _stakingPool.getStakeSharesSupply();

      uint newRewardPerShare = _stakingPool.getAccNxmPerRewardsShare().uncheckedSub(lastAccNxmPerRewardShare);
      uint reward = pendingRewards + newRewardPerShare * rewardsShares / ONE_NXM;

      deposit.stake = stake;
      deposit.stakeShares = stakeShares;
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
      ) = _stakingPool.getDeposit(tokenId, i);

      if (rewardsShares == 0) {
        continue;
      }

      (
        uint accNxmPerRewardShareAtExpiry,
        uint stakeAmountAtExpiry,
        uint stakeShareSupplyAtExpiry
      ) = _stakingPool.getExpiredTranche(i);

      // to avoid this the workaround is to call processExpirations as the first call in the
      // multicall batch. this will require the call to be explicitly be static in js:
      // viewer.callStatic.multicall(...)
      require(stakeShareSupplyAtExpiry != 0, "Tranche expired but expirations were not processed");

      Deposit memory deposit;
      deposit.stake = stakeAmountAtExpiry * stakeShares / stakeShareSupplyAtExpiry;
      deposit.stakeShares = stakeShares;

      uint newRewardPerShare = accNxmPerRewardShareAtExpiry.uncheckedSub(lastAccNxmPerRewardShare);
      deposit.reward = pendingRewards + newRewardPerShare * rewardsShares / ONE_NXM;

      deposit.tokenId = tokenId;
      deposit.trancheId = i;

      depositsQueue[depositCount] = deposit;
      depositCount++;

      token.expiredStake += deposit.stake;
      token.rewards += deposit.reward;
    }

    token.tokenId = tokenId;
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

  function getManagedStakingPools(address manager) public view returns (Pool[] memory) {

    (Pool[] memory unfilledPoolsArray, uint256 matchingCount) = _getMatchingPools(manager);
    Pool[] memory pools = new Pool[](matchingCount);

    // fill the new pools array with exactly the number of managed staking pools
    for (uint256 i = 0; i < matchingCount; i++) {
      pools[i] = unfilledPoolsArray[i];
    }

    return pools;
  }

  function getManagerTokenRewardsByAddr(address manager) public view returns (Token[] memory tokens) {

    (Pool[] memory managedPools, uint256 managedPoolCount) = _getMatchingPools(manager);
    tokens = new Token[](managedPoolCount);

    for (uint256 i = 0; i < managedPoolCount; i++) {
      tokens[i] = _getToken(managedPools[i].poolId, 0);
    }

    return tokens;
  }

  function getManagerTotalRewards(address manager) public view returns (uint managerTotalRewards) {

    Token[] memory tokenRewards = getManagerTokenRewardsByAddr(manager);

    for (uint i = 0; i < tokenRewards.length; i++) {
      managerTotalRewards += tokenRewards[i].rewards;
    }
  }

  function getManagerPoolsAndRewards(address manager) external view returns (ManagerPoolsAndRewards memory) {

    Pool[] memory pools =  getManagedStakingPools(manager);
    Token[] memory tokens = getManagerTokenRewardsByAddr(manager);
    uint totalRewards = getManagerTotalRewards(manager);

    return ManagerPoolsAndRewards({pools: pools, rewards: tokens, totalRewards: totalRewards});
  }

  function getManagerRewards(uint[] memory poolIds) external view returns (Token[] memory tokens) {

    tokens = new Token[](poolIds.length);

    for (uint i = 0; i < poolIds.length; i++) {
      tokens[i] = _getToken(poolIds[i], 0);
    }
  }

  function processExpirationsFor(uint[] memory tokenIds) external {

    for (uint i = 0; i < tokenIds.length; i++) {
      uint poolId = stakingNFT.stakingPoolOf(tokenIds[i]);
      stakingPool(poolId).processExpirations(true);
    }
  }

  function processExpirations(uint[] memory poolIds) public {

    for (uint i = 0; i < poolIds.length; i++) {
      stakingPool(poolIds[i]).processExpirations(true);
    }
  }

  function _getMatchingPools(address manager) internal view returns (Pool[] memory matchingPools, uint matchingCount) {

    uint poolCount = stakingPoolFactory.stakingPoolCount();
    matchingPools = new Pool[](poolCount);
    uint index = 0;

    for (uint i = 1; i <= poolCount; i++) {
        Pool memory pool = getPool(i);
        if (pool.manager == manager) {
            matchingPools[index] = pool;
            index++;
        }
    }

    return (matchingPools, index);
  }
}
