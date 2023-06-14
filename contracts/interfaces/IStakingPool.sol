// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

/* structs for io */

struct AllocationRequest {
  uint productId;
  uint coverId;
  uint allocationId;
  uint period;
  uint gracePeriod;
  bool useFixedPrice;
  uint previousStart;
  uint previousExpiration;
  uint previousRewardsRatio;
  uint globalCapacityRatio;
  uint capacityReductionRatio;
  uint rewardRatio;
  uint globalMinPrice;
}

struct StakedProductParam {
  uint productId;
  bool recalculateEffectiveWeight;
  bool setTargetWeight;
  uint8 targetWeight;
  bool setTargetPrice;
  uint96 targetPrice;
}

  struct BurnStakeParams {
    uint allocationId;
    uint productId;
    uint start;
    uint period;
    uint deallocationAmount;
  }

interface IStakingPool {

  /* structs for storage */

  // stakers are grouped in tranches based on the timelock expiration
  // tranche index is calculated based on the expiration date
  // the initial proposal is to have 4 tranches per year (1 tranche per quarter)
  struct Tranche {
    uint128 stakeShares;
    uint128 rewardsShares;
  }

  struct ExpiredTranche {
    uint96 accNxmPerRewardShareAtExpiry;
    uint96 stakeAmountAtExpiry; // nxm total supply is 6.7e24 and uint96.max is 7.9e28
    uint128 stakeSharesSupplyAtExpiry;
  }

  struct Deposit {
    uint96 lastAccNxmPerRewardShare;
    uint96 pendingRewards;
    uint128 stakeShares;
    uint128 rewardsShares;
  }

  function initialize(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    uint _poolId,
    string memory ipfsDescriptionHash
  ) external;

  function processExpirations(bool updateUntilCurrentTimestamp) external;

  function requestAllocation(
    uint amount,
    uint previousPremium,
    AllocationRequest calldata request
  ) external returns (uint premium, uint allocationId);

  function burnStake(uint amount, BurnStakeParams calldata params) external;

  function depositTo(
    uint amount,
    uint trancheId,
    uint requestTokenId,
    address destination
  ) external returns (uint tokenId);

  function withdraw(
    uint tokenId,
    bool withdrawStake,
    bool withdrawRewards,
    uint[] memory trancheIds
  ) external returns (uint withdrawnStake, uint withdrawnRewards);

  function isPrivatePool() external view returns (bool);

  function isHalted() external view returns (bool);

  function manager() external view returns (address);

  function getPoolId() external view returns (uint);

  function getPoolFee() external view returns (uint);

  function getMaxPoolFee() external view returns (uint);

  function getActiveStake() external view returns (uint);

  function getStakeSharesSupply() external view returns (uint);

  function getRewardsSharesSupply() external view returns (uint);

  function getRewardPerSecond() external view returns (uint);

  function getAccNxmPerRewardsShare() external view returns (uint);

  function getLastAccNxmUpdate() external view returns (uint);

  function getFirstActiveTrancheId() external view returns (uint);

  function getFirstActiveBucketId() external view returns (uint);

  function getNextAllocationId() external view returns (uint);

  function getDeposit(uint tokenId, uint trancheId) external view returns (
    uint lastAccNxmPerRewardShare,
    uint pendingRewards,
    uint stakeShares,
    uint rewardsShares
  );

  function getTranche(uint trancheId) external view returns (
    uint stakeShares,
    uint rewardsShares
  );

  function getExpiredTranche(uint trancheId) external view returns (
    uint accNxmPerRewardShareAtExpiry,
    uint stakeAmountAtExpiry,
    uint stakeShareSupplyAtExpiry
  );

  function setPoolFee(uint newFee) external;

  function setPoolPrivacy(bool isPrivatePool) external;

  function getActiveAllocations(
    uint productId
  ) external view returns (uint[] memory trancheAllocations);

  function getTrancheCapacities(
    uint productId,
    uint firstTrancheId,
    uint trancheCount,
    uint capacityRatio,
    uint reductionRatio
  ) external view returns (uint[] memory trancheCapacities);

  /* ========== EVENTS ========== */

  event StakeDeposited(address indexed user, uint256 amount, uint256 trancheId, uint256 tokenId);

  event DepositExtended(address indexed user, uint256 tokenId, uint256 initialTrancheId, uint256 newTrancheId, uint256 topUpAmount);

  event PoolPrivacyChanged(address indexed manager, bool isPrivate);

  event PoolFeeChanged(address indexed manager, uint newFee);

  event PoolDescriptionSet(string ipfsDescriptionHash);

  event Withdraw(address indexed user, uint indexed tokenId, uint tranche, uint amountStakeWithdrawn, uint amountRewardsWithdrawn);

  event StakeBurned(uint amount);

  event Deallocated(uint productId);

  event BucketExpired(uint bucketId);

  event TrancheExpired(uint trancheId);

  // Auth
  error OnlyCoverContract();
  error OnlyManager();
  error PrivatePool();
  error SystemPaused();
  error PoolHalted();

  // Fees
  error PoolFeeExceedsMax();
  error MaxPoolFeeAbove100();

  // Voting
  error NxmIsLockedForGovernanceVote();
  error ManagerNxmIsLockedForGovernanceVote();

  // Deposit
  error InsufficientDepositAmount();
  error RewardRatioTooHigh();

  // Staking NFTs
  error InvalidTokenId();
  error NotTokenOwnerOrApproved();
  error InvalidStakingPoolForToken();

  // Tranche & capacity
  error NewTrancheEndsBeforeInitialTranche();
  error RequestedTrancheIsNotYetActive();
  error RequestedTrancheIsExpired();
  error InsufficientCapacity();

  // Allocation
  error AlreadyDeallocated(uint allocationId);
}
