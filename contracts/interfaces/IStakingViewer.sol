// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "./IStakingPool.sol";

interface IStakingViewer {
  struct Pool {
    uint poolId;
    bool isPrivatePool;
    address manager;
    uint poolFee;
    uint maxPoolFee;
    uint activeStake;
    uint currentAPY;
    string metadataIpfsHash;
  }

  struct StakingProduct {
    uint productId;
    uint lastEffectiveWeight;
    uint targetWeight;
    uint targetPrice;
    uint bumpedPrice;
    uint bumpedPriceUpdateTime;
  }

  struct Deposit {
    uint tokenId;
    uint trancheId;
    uint stake;
    uint stakeShares;
    uint reward;
  }

  struct Token {
    uint tokenId;
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

  struct ManagerPoolsAndRewards {
    Pool[] pools;
    Token[] rewards;
    uint totalRewards;
  }

  /* ========== VIEWS ========== */

  function TRANCHE_DURATION() external view returns (uint);

  function MAX_ACTIVE_TRANCHES() external view returns (uint);

  function ONE_NXM() external view returns (uint);

  function TRANCHE_ID_AT_DEPLOY() external view returns (uint);

  function MAX_UINT() external view returns (uint);

  function stakingPool(uint poolId) external view returns (IStakingPool);

  function getPool(uint poolId) external view returns (Pool memory pool);

  function getPools(uint[] memory poolIds) external view returns (Pool[] memory pools);

  function getAllPools() external view returns (Pool[] memory pools);

  function getProductPools(uint productId) external view returns (Pool[] memory pools);

  function getPoolProducts(uint poolId) external view returns (StakingProduct[] memory products);

  function getStakingPoolsOf(uint[] memory tokenIds) external view returns (TokenPoolMap[] memory tokenPools);

  function getToken(uint tokenId) external view returns (Token memory token);

  function getTokens(uint[] memory tokenIds) external view returns (Token[] memory tokens);

  function getAggregatedTokens(uint[] calldata tokenIds) external view returns (AggregatedTokens memory aggregated);

  function getManagedStakingPools(address manager) external view returns (Pool[] memory);

  function getManagerTokenRewardsByAddr(address manager) external view returns (Token[] memory tokens);

  function getManagerTotalRewards(address manager) external view returns (uint managerTotalRewards);

  function getManagerPoolsAndRewards(address manager) external view returns (ManagerPoolsAndRewards memory);

  function getManagerRewards(uint[] memory poolIds) external view returns (Token[] memory tokens);

  /* === MUTATIVE FUNCTIONS ==== */

  function processExpirationsFor(uint[] memory tokenIds) external;

  function processExpirations(uint[] memory poolIds) external;
}
