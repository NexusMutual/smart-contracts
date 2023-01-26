// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../abstract/Multicall.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/INXMToken.sol";
import "../../libraries/Math.sol";
import "../../libraries/UncheckedMath.sol";
import "../../libraries/SafeUintCast.sol";
import "./StakingTypesLib.sol";

// total stake = active stake + expired stake
// total capacity = active stake * global capacity factor
// total product capacity = total capacity * capacity reduction factor * product weight
// total product capacity = allocated product capacity + available product capacity
// on cover buys we allocate the available product capacity
// on cover expiration we deallocate the capacity and it becomes available again

contract StakingPool is IStakingPool, Multicall {
  using StakingTypesLib for TrancheAllocationGroup;
  using StakingTypesLib for TrancheGroupBucket;
  using SafeUintCast for uint;
  using UncheckedMath for uint;

  /* storage */

  // slot 1
  // supply of pool stake shares used by tranches
  uint128 public stakeSharesSupply;

  // supply of pool rewards shares used by tranches
  uint128 public rewardsSharesSupply;

  // slot 2
  // accumulated rewarded nxm per reward share
  uint96 public accNxmPerRewardsShare;

  // currently active staked nxm amount
  uint96 public activeStake;

  uint32 public firstActiveTrancheId;
  uint32 public firstActiveBucketId;

  // slot 3
  // timestamp when accNxmPerRewardsShare was last updated
  uint32 public lastAccNxmUpdate;
  // current nxm reward per second for the entire pool
  // applies to active stake only and does not need update on deposits
  uint96 public rewardPerSecond;

  uint40 poolId;
  uint24 public nextAllocationId;

  bool public isPrivatePool;

  uint8 public poolFee;
  uint8 public maxPoolFee;

  // 40 bytes left in slot 3

  // slot 4
  address public manager;
  uint32 public totalEffectiveWeight;
  uint32 public totalTargetWeight;

  // 32 bytes left in slot 4

  // tranche id => tranche data
  mapping(uint => Tranche) public tranches;

  // tranche id => expired tranche data
  mapping(uint => ExpiredTranche) public expiredTranches;

  // reward bucket id => RewardBucket
  mapping (uint => uint) public rewardPerSecondCut;

  // product id => tranche group id => active allocations for a tranche group
  mapping(uint => mapping(uint => TrancheAllocationGroup)) public trancheAllocationGroups;

  // product id => bucket id => bucket tranche group id => tranche group's expiring cover amounts
  mapping(uint => mapping(uint => mapping(uint => TrancheGroupBucket))) public expiringCoverBuckets;

  // cover id => per tranche cover amounts (8 32-bit values, one per tranche, packed in a slot)
  // starts with the first active tranche at the time of cover buy
  mapping(uint => uint) public coverTrancheAllocations;

  // product id => Product
  mapping(uint => StakedProduct) public products;

  // token id => tranche id => deposit data
  mapping(uint => mapping(uint => Deposit)) public deposits;

  /* immutables */

  IStakingNFT public immutable stakingNFT;
  INXMToken public immutable nxm;
  ITokenController public  immutable tokenController;
  address public immutable coverContract;
  INXMMaster public immutable masterContract;

  /* constants */

  // 7 * 13 = 91
  uint public constant BUCKET_DURATION = 28 days;
  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8; // 7 whole quarters + 1 partial quarter

  uint public constant COVER_TRANCHE_GROUP_SIZE = 5;
  uint public constant BUCKET_TRANCHE_GROUP_SIZE = 8;

  uint public constant REWARD_BONUS_PER_TRANCHE_RATIO = 10_00; // 10.00%
  uint public constant REWARD_BONUS_PER_TRANCHE_DENOMINATOR = 100_00;
  uint public constant MAX_TOTAL_WEIGHT = 20_00; // 20x
  uint public constant WEIGHT_DENOMINATOR = 100;
  uint public constant REWARDS_DENOMINATOR = 100_00;
  uint public constant POOL_FEE_DENOMINATOR = 100;

  // denominators for cover contract parameters
  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 100_00;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 100_00;
  uint public constant INITIAL_PRICE_DENOMINATOR = 100_00;
  uint public constant TARGET_PRICE_DENOMINATOR = 100_00;

  // base price bump
  // +0.2% for each 1% of capacity used, ie +20% for 100%
  uint public constant PRICE_BUMP_RATIO = 20_00; // 20%

  // bumped price smoothing
  // 0.5% per day
  uint public constant PRICE_CHANGE_PER_DAY = 50; // 0.5%

  // +2% for every 1%, ie +200% for 100%
  uint public constant SURGE_PRICE_RATIO = 2 ether;

  uint public constant SURGE_THRESHOLD_RATIO = 90_00; // 90.00%
  uint public constant SURGE_THRESHOLD_DENOMINATOR = 100_00; // 100.00%

  // 1 nxm = 1e18
  uint public constant ONE_NXM = 1 ether;

  // internally we store capacity using 2 decimals
  // 1 nxm of capacity is stored as 100
  uint public constant ALLOCATION_UNITS_PER_NXM = 100;

  // given capacities have 2 decimals
  // smallest unit we can allocate is 1e18 / 100 = 1e16 = 0.01 NXM
  uint public constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;

  uint public constant MAX_UINT = type(uint).max;

  modifier onlyCoverContract {
    if (msg.sender != coverContract) {
      revert OnlyCoverContract();
    }
    _;
  }

  modifier onlyManager {
    if (msg.sender != manager) {
      revert OnlyManager();
    }
    _;
  }

  modifier whenNotPaused {
    require(!masterContract.isPause(), "System is paused");
    _;
  }

  constructor (
    address _stakingNFT,
    address _token,
    address _coverContract,
    address _tokenController,
    address _master
  ) {
    stakingNFT = IStakingNFT(_stakingNFT);
    nxm = INXMToken(_token);
    coverContract = _coverContract;
    tokenController = ITokenController(_tokenController);
    masterContract = INXMMaster(_master);
  }

  function initialize(
    address _manager,
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    ProductInitializationParams[] calldata params,
    uint _poolId,
    string  calldata ipfsDescriptionHash
  ) external onlyCoverContract {

    if (_initialPoolFee > _maxPoolFee) {
      revert PoolFeeExceedsMax();
    }

    if (_maxPoolFee >= 100) {
      revert MaxPoolFeeAbove100();
    }

    manager = _manager;
    isPrivatePool = _isPrivatePool;
    poolFee = uint8(_initialPoolFee);
    maxPoolFee = uint8(_maxPoolFee);
    poolId = _poolId.toUint40();

    _setInitialProducts(params);

    emit PoolDescriptionSet(ipfsDescriptionHash);
  }

  // updateUntilCurrentTimestamp forces rewards update until current timestamp not just until
  // bucket/tranche expiry timestamps. Must be true when changing shares or reward per second.
  function processExpirations(bool updateUntilCurrentTimestamp) public {

    uint _firstActiveBucketId = firstActiveBucketId;
    uint _firstActiveTrancheId = firstActiveTrancheId;

    uint currentBucketId = block.timestamp / BUCKET_DURATION;
    uint currentTrancheId = block.timestamp / TRANCHE_DURATION;

    // if the pool is new
    if (_firstActiveBucketId == 0) {
      _firstActiveBucketId = currentBucketId;
      _firstActiveTrancheId = currentTrancheId;
    }

    // if a force update was not requested
    if (!updateUntilCurrentTimestamp) {

      bool canExpireBuckets = _firstActiveBucketId < currentBucketId;
      bool canExpireTranches = _firstActiveTrancheId < currentTrancheId;

      // and if there's nothing to expire
      if (!canExpireBuckets && !canExpireTranches) {
        // we can exit
        return;
      }
    }

    // SLOAD
    uint _activeStake = activeStake;
    uint _rewardPerSecond = rewardPerSecond;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _lastAccNxmUpdate = lastAccNxmUpdate;

    // exit early if we already updated in the current block
    if (_lastAccNxmUpdate == block.timestamp) {
      return;
    }

    if (_rewardsSharesSupply == 0) {
      // nothing to do, just update lastAccNxmUpdate
      lastAccNxmUpdate = block.timestamp.toUint32();
      return;
    }

    while (_firstActiveBucketId < currentBucketId || _firstActiveTrancheId < currentTrancheId) {

      // what expires first, the bucket or the tranche?
      bool bucketExpiresFirst;
      {
        uint nextBucketStart = (_firstActiveBucketId + 1) * BUCKET_DURATION;
        uint nextTrancheStart = (_firstActiveTrancheId + 1) * TRANCHE_DURATION;
        bucketExpiresFirst = nextBucketStart <= nextTrancheStart;
      }

      if (bucketExpiresFirst) {

        // expire a bucket
        // each bucket contains a reward reduction - we subtract it when the bucket *starts*!

        ++_firstActiveBucketId;
        uint bucketStartTime = _firstActiveBucketId * BUCKET_DURATION;
        uint elapsed = bucketStartTime - _lastAccNxmUpdate;

        uint newAccNxmPerRewardsShare = _rewardsSharesSupply != 0
          ? elapsed * _rewardPerSecond * ONE_NXM / _rewardsSharesSupply
          : 0;

        _accNxmPerRewardsShare = _accNxmPerRewardsShare.uncheckedAdd(newAccNxmPerRewardsShare);

        _rewardPerSecond -= rewardPerSecondCut[_firstActiveBucketId];
        _lastAccNxmUpdate = bucketStartTime;

        continue;
      }

      // expire a tranche
      // each tranche contains shares - we expire them when the tranche *ends*
      // TODO: check if we have to expire the tranche
      {
        uint trancheEndTime = (_firstActiveTrancheId + 1) * TRANCHE_DURATION;
        uint elapsed = trancheEndTime - _lastAccNxmUpdate;
        uint newAccNxmPerRewardsShare = _rewardsSharesSupply != 0
          ? elapsed * _rewardPerSecond * ONE_NXM / _rewardsSharesSupply
          : 0;
        _accNxmPerRewardsShare = _accNxmPerRewardsShare.uncheckedAdd(newAccNxmPerRewardsShare);
        _lastAccNxmUpdate = trancheEndTime;

        // SSTORE
        expiredTranches[_firstActiveTrancheId] = ExpiredTranche(
          _accNxmPerRewardsShare.toUint96(), // accNxmPerRewardShareAtExpiry
          _activeStake.toUint96(), // stakeAmountAtExpiry
          _stakeSharesSupply.toUint128() // stakeSharesSupplyAtExpiry
        );

        // SLOAD and then SSTORE zero to get the gas refund
        Tranche memory expiringTranche = tranches[_firstActiveTrancheId];
        delete tranches[_firstActiveTrancheId];

        // the tranche is expired now so we decrease the stake and the shares supply
        uint expiredStake = _stakeSharesSupply != 0
          ? (_activeStake * expiringTranche.stakeShares) / _stakeSharesSupply
          : 0;

        _activeStake -= expiredStake;
        _stakeSharesSupply -= expiringTranche.stakeShares;
        _rewardsSharesSupply -= expiringTranche.rewardsShares;

        // advance to the next tranche
        _firstActiveTrancheId++;
      }

      // end while
    }

    if (updateUntilCurrentTimestamp) {
      uint elapsed = block.timestamp - _lastAccNxmUpdate;
      uint newAccNxmPerRewardsShare = _rewardsSharesSupply != 0
        ? elapsed * _rewardPerSecond * ONE_NXM / _rewardsSharesSupply
        : 0;
      _accNxmPerRewardsShare = _accNxmPerRewardsShare.uncheckedAdd(newAccNxmPerRewardsShare);
      _lastAccNxmUpdate = block.timestamp;
    }

    firstActiveTrancheId = _firstActiveTrancheId.toUint32();
    firstActiveBucketId = _firstActiveBucketId.toUint32();

    activeStake = _activeStake.toUint96();
    rewardPerSecond = _rewardPerSecond.toUint96();
    accNxmPerRewardsShare = _accNxmPerRewardsShare.toUint96();
    lastAccNxmUpdate = _lastAccNxmUpdate.toUint32();
    stakeSharesSupply = _stakeSharesSupply.toUint128();
    rewardsSharesSupply = _rewardsSharesSupply.toUint128();
  }

  function depositTo(
    uint amount,
    uint trancheId,
    uint requestTokenId,
    address destination
  ) public whenNotPaused returns (uint tokenId) {

    if (isPrivatePool) {
      if (msg.sender != manager) {
        revert PrivatePool();
      }
    }

    if (block.timestamp <= nxm.isLockedForMV(msg.sender)) {
      revert NxmIsLockedForGovernanceVote();
    }

    {
      uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
      uint maxTranche = _firstActiveTrancheId + MAX_ACTIVE_TRANCHES - 1;

      if (amount == 0) {
        revert InsufficientDepositAmount();
      }
      if (trancheId > maxTranche) {
        revert RequestedTrancheIsNotYetActive();
      }
      if (trancheId < _firstActiveTrancheId) {
        revert RequestedTrancheIsExpired();
      }

      // if the pool has no previous deposits
      if (firstActiveTrancheId == 0) {
        firstActiveTrancheId = _firstActiveTrancheId.toUint32();
        firstActiveBucketId = (block.timestamp / BUCKET_DURATION).toUint32();
        lastAccNxmUpdate = block.timestamp.toUint32();
      } else {
        processExpirations(true);
      }
    }

    // storage reads
    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint totalAmount;

    // deposit to token id = MAX_UINT is not allowed
    // we treat it as a flag to create a new token
    if (requestTokenId == MAX_UINT) {
      address to = destination == address(0) ? msg.sender : destination;
      tokenId = stakingNFT.mint(poolId, to);
    } else {
      // validate token id exists and belongs to this pool
      // stakingPoolOf() reverts for non-existent tokens
      require(
        stakingNFT.stakingPoolOf(requestTokenId) == poolId,
        "StakingPool: Token does not belong to this pool"
      );
      tokenId = requestTokenId;
    }

    uint newStakeShares = _stakeSharesSupply == 0
      ? Math.sqrt(amount)
      : _stakeSharesSupply * amount / _activeStake;

    uint newRewardsShares;

    // update deposit and pending reward
    {
      // conditional read
      Deposit memory deposit = requestTokenId == MAX_UINT
        ? Deposit(0, 0, 0, 0)
        : deposits[tokenId][trancheId];

      newRewardsShares = calculateNewRewardShares(
        deposit.stakeShares, // initialStakeShares
        newStakeShares,      // newStakeShares
        trancheId,   // initialTrancheId
        trancheId,   // newTrancheId, the same as initialTrancheId in this case
        block.timestamp
      );

      // if we're increasing an existing deposit
      if (deposit.rewardsShares != 0) {
        uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(deposit.lastAccNxmPerRewardShare);
        deposit.pendingRewards += (newEarningsPerShare * deposit.rewardsShares / ONE_NXM).toUint96();
      }

      deposit.stakeShares += newStakeShares.toUint128();
      deposit.rewardsShares += newRewardsShares.toUint96();
      deposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();

      // store
      deposits[tokenId][trancheId] = deposit;
    }

    // update pool manager's reward shares
    {
      Deposit memory feeDeposit = deposits[MAX_UINT][trancheId];

      {
        // create fee deposit reward shares
        uint newFeeRewardShares = newRewardsShares * poolFee / (POOL_FEE_DENOMINATOR - poolFee);
        newRewardsShares += newFeeRewardShares;

        // calculate rewards until now
        uint newRewardPerShare = _accNxmPerRewardsShare.uncheckedSub(feeDeposit.lastAccNxmPerRewardShare);
        feeDeposit.pendingRewards += (newRewardPerShare * feeDeposit.rewardsShares / ONE_NXM).toUint96();
        feeDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();
        feeDeposit.rewardsShares += newFeeRewardShares.toUint96();
      }

      deposits[MAX_UINT][trancheId] = feeDeposit;
    }

    // update tranche
    {
      Tranche memory tranche = tranches[trancheId];
      tranche.stakeShares += newStakeShares.toUint128();
      tranche.rewardsShares += newRewardsShares.toUint128();
      tranches[trancheId] = tranche;
    }

    totalAmount += amount;
    _activeStake += amount;
    _stakeSharesSupply += newStakeShares;
    _rewardsSharesSupply += newRewardsShares;

    // transfer nxm from the staker and update the pool deposit balance
    tokenController.depositStakedNXM(msg.sender, totalAmount, poolId);

    // update globals
    activeStake = _activeStake.toUint96();
    stakeSharesSupply = _stakeSharesSupply.toUint128();
    rewardsSharesSupply = _rewardsSharesSupply.toUint128();

    emit StakeDeposited(msg.sender, amount, trancheId, tokenId);
  }

  function getTimeLeftOfTranche(uint trancheId, uint blockTimestamp) internal pure returns (uint) {
    uint endDate = (trancheId + 1) * TRANCHE_DURATION;
    return endDate > blockTimestamp ? endDate - blockTimestamp : 0;
  }

  /// Calculates the amount of new reward shares based on the initial and new stake shares
  ///
  /// @param initialStakeShares   Amount of stake shares the deposit is already entitled to
  /// @param stakeSharesIncrease  Amount of additional stake shares the deposit will be entitled to
  /// @param initialTrancheId     The id of the initial tranche that defines the deposit period
  /// @param newTrancheId         The new id of the tranche that will define the deposit period
  /// @param blockTimestamp       The timestamp of the block when the new shares are recalculated
  function calculateNewRewardShares(
    uint initialStakeShares,
    uint stakeSharesIncrease,
    uint initialTrancheId,
    uint newTrancheId,
    uint blockTimestamp
  ) public pure returns (uint) {

    uint timeLeftOfInitialTranche = getTimeLeftOfTranche(initialTrancheId, blockTimestamp);
    uint timeLeftOfNewTranche = getTimeLeftOfTranche(newTrancheId, blockTimestamp);

    // the bonus is based on the the time left and the total amount of stake shares (initial + new)
    uint newBonusShares = (initialStakeShares + stakeSharesIncrease)
      * REWARD_BONUS_PER_TRANCHE_RATIO
      * timeLeftOfNewTranche
      / TRANCHE_DURATION
      / REWARD_BONUS_PER_TRANCHE_DENOMINATOR;

    // for existing deposits, the previous bonus is deducted from the final amount
    uint previousBonusSharesDeduction = initialStakeShares
      * REWARD_BONUS_PER_TRANCHE_RATIO
      * timeLeftOfInitialTranche
      / TRANCHE_DURATION
      / REWARD_BONUS_PER_TRANCHE_DENOMINATOR;

    return stakeSharesIncrease + newBonusShares - previousBonusSharesDeduction;
  }

  function withdraw(
    uint tokenId,
    bool withdrawStake,
    bool withdrawRewards,
    uint[] memory trancheIds
  ) public whenNotPaused returns (uint withdrawnStake, uint withdrawnRewards) {

    uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager);

    // pass false as it does not modify the share supply nor the reward per second
    processExpirations(false);

    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint trancheCount = trancheIds.length;

    for (uint j = 0; j < trancheCount; j++) {

      uint trancheId = trancheIds[j];

      Deposit memory deposit = deposits[tokenId][trancheId];

      {
        uint trancheRewardsToWithdraw;
        uint trancheStakeToWithdraw;

        // can withdraw stake only if the tranche is expired
        if (withdrawStake && trancheId < _firstActiveTrancheId) {

          // Deposit withdrawals are not permitted while the manager is locked in governance to
          // prevent double voting.
          if(managerLockedInGovernanceUntil > block.timestamp) {
            revert ManagerNxmIsLockedForGovernanceVote();
          }

          // calculate the amount of nxm for this deposit
          uint stake = expiredTranches[trancheId].stakeAmountAtExpiry;
          uint _stakeSharesSupply = expiredTranches[trancheId].stakeSharesSupplyAtExpiry;
          trancheStakeToWithdraw = stake * deposit.stakeShares / _stakeSharesSupply;
          withdrawnStake += trancheStakeToWithdraw;

          // mark as withdrawn
          deposit.stakeShares = 0;
        }

        if (withdrawRewards) {

          // if the tranche is expired, use the accumulator value saved at expiration time
          uint accNxmPerRewardShareToUse = trancheId < _firstActiveTrancheId
            ? expiredTranches[trancheId].accNxmPerRewardShareAtExpiry
            : _accNxmPerRewardsShare;

          // calculate reward since checkpoint
          uint newRewardPerShare = accNxmPerRewardShareToUse.uncheckedSub(deposit.lastAccNxmPerRewardShare);
          trancheRewardsToWithdraw = newRewardPerShare * deposit.rewardsShares / ONE_NXM + deposit.pendingRewards;
          withdrawnRewards += trancheRewardsToWithdraw;

          // save checkpoint
          deposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();
          deposit.pendingRewards = 0;
          deposit.rewardsShares = 0;
        }

        emit Withdraw(msg.sender, tokenId, trancheId, trancheStakeToWithdraw, trancheRewardsToWithdraw);
      }

      deposits[tokenId][trancheId] = deposit;
    }

    address destination = tokenId == MAX_UINT
      ? manager
      : stakingNFT.ownerOf(tokenId);

    tokenController.withdrawNXMStakeAndRewards(
      destination,
      withdrawnStake,
      withdrawnRewards,
      poolId
    );

    return (withdrawnStake, withdrawnRewards);
  }

  function requestAllocation(
    uint amount,
    uint previousPremium,
    AllocationRequest calldata request
  ) external onlyCoverContract returns (uint premium, uint allocationId) {

    // passing true because we change the reward per second
    processExpirations(true);

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;

    uint[] memory trancheAllocations = request.allocationId == type(uint).max
      ? getActiveAllocations(request.productId)
      : getActiveAllocationsWithoutCover(
          request.productId,
          request.allocationId,
          request.previousStart,
          request.previousExpiration
        );

    // we are only deallocating
    // rewards streaming is left as is
    if (amount == 0) {

      // store deallocated amount
      updateStoredAllocations(
        request.productId,
        _firstActiveTrancheId,
        trancheAllocations
      );

      // no need to charge any premium
      // returning maxUint as allocationId since there was no allocation
      // and since amount is 0 allocation will not be saved in the segment
      return (0, type(uint).max);
    }

    uint coverAllocationAmount;
    uint initialCapacityUsed;
    uint totalCapacity;
    (
      coverAllocationAmount,
      initialCapacityUsed,
      totalCapacity,
      allocationId
    ) = allocate(amount, request, trancheAllocations);

    // the returned premium value has 18 decimals
    premium = getPremium(
      request.productId,
      request.period,
      coverAllocationAmount,
      initialCapacityUsed,
      totalCapacity,
      request.globalMinPrice,
      request.useFixedPrice
    );

    // add new rewards
    {
      if(request.rewardRatio > REWARDS_DENOMINATOR) {
        revert RewardRatioTooHigh();
      }

      uint expirationBucket = Math.divCeil(block.timestamp + request.period, BUCKET_DURATION);
      uint rewardStreamPeriod = expirationBucket * BUCKET_DURATION - block.timestamp;
      uint _rewardPerSecond = (premium * request.rewardRatio / REWARDS_DENOMINATOR) / rewardStreamPeriod;

      // store
      rewardPerSecondCut[expirationBucket] += _rewardPerSecond;
      rewardPerSecond += _rewardPerSecond.toUint96();

      uint rewardsToMint = _rewardPerSecond * rewardStreamPeriod;
      tokenController.mintStakingPoolNXMRewards(rewardsToMint, poolId);
    }

    // remove previous rewards
    if (previousPremium > 0) {

      uint prevRewards = previousPremium * request.previousRewardsRatio / REWARDS_DENOMINATOR;
      uint prevExpirationBucket = Math.divCeil(request.previousExpiration, BUCKET_DURATION);
      uint rewardStreamPeriod = prevExpirationBucket * BUCKET_DURATION - request.previousStart;
      uint prevRewardsPerSecond = prevRewards / rewardStreamPeriod;

      // store
      rewardPerSecondCut[prevExpirationBucket] -= prevRewardsPerSecond;
      rewardPerSecond -= prevRewardsPerSecond.toUint96();

      // prevRewardsPerSecond * rewardStreamPeriodLeft
      uint rewardsToBurn = prevRewardsPerSecond * (prevExpirationBucket * BUCKET_DURATION - block.timestamp);
      tokenController.burnStakingPoolNXMRewards(rewardsToBurn, poolId);
    }

    return (premium, allocationId);
  }

  function getActiveAllocationsWithoutCover(
    uint productId,
    uint allocationId,
    uint start,
    uint expiration
  ) internal returns (uint[] memory activeAllocations) {

    uint packedCoverTrancheAllocation = coverTrancheAllocations[allocationId];
    activeAllocations = getActiveAllocations(productId);

    uint currentFirstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint[] memory coverAllocations = new uint[](MAX_ACTIVE_TRANCHES);

    // number of already expired tranches to skip
    // currentFirstActiveTranche - previousFirstActiveTranche
    uint offset = currentFirstActiveTrancheId - (start / TRANCHE_DURATION);
    for (uint i = offset; i < MAX_ACTIVE_TRANCHES; i++) {
      uint allocated = uint32(packedCoverTrancheAllocation >> (i * 32));
      uint currentTrancheIdx = i - offset;
      activeAllocations[currentTrancheIdx] -= allocated;
      coverAllocations[currentTrancheIdx] = allocated;
    }

    // remove expiring cover amounts from buckets
    updateExpiringCoverAmounts(
      productId,
      currentFirstActiveTrancheId,
      Math.divCeil(expiration, BUCKET_DURATION), // targetBucketId
      coverAllocations,
      false // isAllocation
    );

    return activeAllocations;
  }

  function getActiveAllocations(
    uint productId
  ) public view returns (uint[] memory trancheAllocations) {

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint currentBucket = (block.timestamp / BUCKET_DURATION).toUint16();
    uint lastBucketId;

    (trancheAllocations, lastBucketId) = getStoredAllocations(productId, _firstActiveTrancheId);

    if (lastBucketId == 0) {
      lastBucketId = currentBucket;
    }

    for (uint bucketId = lastBucketId + 1; bucketId <= currentBucket; bucketId++) {

      uint[] memory expirations = getExpiringCoverAmounts(productId, bucketId, _firstActiveTrancheId);

      for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
        trancheAllocations[i] -= expirations[i];
      }
    }

    return trancheAllocations;
  }

  function getStoredAllocations(
    uint productId,
    uint firstTrancheId
  ) internal view returns (
    uint[] memory storedAllocations,
    uint16 lastBucketId
  ) {

    storedAllocations = new uint[](MAX_ACTIVE_TRANCHES);

    uint firstGroupId = firstTrancheId / COVER_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + MAX_ACTIVE_TRANCHES - 1) / COVER_TRANCHE_GROUP_SIZE;

    // min 2 and max 3 groups
    uint groupCount = lastGroupId - firstGroupId + 1;

    TrancheAllocationGroup[] memory allocationGroups = new TrancheAllocationGroup[](groupCount);

    for (uint i = 0; i < groupCount; i++) {
      allocationGroups[i] = trancheAllocationGroups[productId][firstGroupId + i];
    }

    lastBucketId = allocationGroups[0].getLastBucketId();

    // flatten groups
    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
      uint trancheId = firstTrancheId + i;
      uint trancheGroupIndex = trancheId / COVER_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % COVER_TRANCHE_GROUP_SIZE;
      storedAllocations[i] = allocationGroups[trancheGroupIndex].getItemAt(trancheIndexInGroup);
    }
  }

  function getExpiringCoverAmounts(
    uint productId,
    uint bucketId,
    uint firstTrancheId
  ) internal view returns (uint[] memory expiringCoverAmounts) {

    expiringCoverAmounts = new uint[](MAX_ACTIVE_TRANCHES);

    uint firstGroupId = firstTrancheId / BUCKET_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + MAX_ACTIVE_TRANCHES - 1) / BUCKET_TRANCHE_GROUP_SIZE;

    // min 1, max 2
    uint groupCount = lastGroupId - firstGroupId + 1;
    TrancheGroupBucket[] memory trancheGroupBuckets = new TrancheGroupBucket[](groupCount);

    // min 1 and max 2 reads
    for (uint i = 0; i < groupCount; i++) {
      trancheGroupBuckets[i] = expiringCoverBuckets[productId][bucketId][firstGroupId + i];
    }

    // flatten bucket tranche groups
    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
      uint trancheId = firstTrancheId + i;
      uint trancheGroupIndex = trancheId / BUCKET_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % BUCKET_TRANCHE_GROUP_SIZE;
      expiringCoverAmounts[i] = trancheGroupBuckets[trancheGroupIndex].getItemAt(trancheIndexInGroup);
    }

    return expiringCoverAmounts;
  }

  function getActiveTrancheCapacities(
    uint productId,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) public view returns (
    uint[] memory trancheCapacities,
    uint totalCapacity
  ) {

    trancheCapacities = getTrancheCapacities(
      productId,
      block.timestamp / TRANCHE_DURATION, // first active tranche id
      MAX_ACTIVE_TRANCHES,
      globalCapacityRatio,
      capacityReductionRatio
    );

    totalCapacity = Math.sum(trancheCapacities);

    return (trancheCapacities, totalCapacity);
  }

  function getTrancheCapacities(
    uint productId,
    uint firstTrancheId,
    uint trancheCount,
    uint capacityRatio,
    uint reductionRatio
  ) internal view returns (uint[] memory trancheCapacities) {

    // TODO: this require statement seems redundant
    if(firstTrancheId < block.timestamp / TRANCHE_DURATION) {
      revert RequestedTrancheIsExpired();
    }

    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    trancheCapacities = new uint[](trancheCount);

    if (_stakeSharesSupply == 0) {
      return trancheCapacities;
    }

    uint multiplier =
      capacityRatio
      * (CAPACITY_REDUCTION_DENOMINATOR - reductionRatio)
      * products[productId].targetWeight;

    uint denominator =
      GLOBAL_CAPACITY_DENOMINATOR
      * CAPACITY_REDUCTION_DENOMINATOR
      * WEIGHT_DENOMINATOR;

    for (uint i = 0; i < trancheCount; i++) {
      uint trancheStake = (_activeStake * tranches[firstTrancheId + i].stakeShares / _stakeSharesSupply);
      trancheCapacities[i] = trancheStake * multiplier / denominator / NXM_PER_ALLOCATION_UNIT;
    }

    return trancheCapacities;
  }

  function allocate(
    uint amount,
    AllocationRequest calldata request,
    uint[] memory trancheAllocations
  ) internal returns (
    uint coverAllocationAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint allocationId
  ) {

    if (request.allocationId == type(uint).max) {
      allocationId = nextAllocationId;
      nextAllocationId++;
    } else {
      allocationId = request.allocationId;
    }

    coverAllocationAmount = Math.divCeil(amount, NXM_PER_ALLOCATION_UNIT);

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint firstTrancheIdToUse = (block.timestamp + request.period + request.gracePeriod) / TRANCHE_DURATION;
    uint startIndex = firstTrancheIdToUse - _firstActiveTrancheId;

    uint[] memory coverAllocations = new uint[](MAX_ACTIVE_TRANCHES);
    uint[] memory trancheCapacities = getTrancheCapacities(
      request.productId,
      firstTrancheIdToUse,
      MAX_ACTIVE_TRANCHES - startIndex, // count
      request.globalCapacityRatio,
      request.capacityReductionRatio
    );

    {
      uint remainingAmount = coverAllocationAmount;
      uint packedCoverAllocations;

      for (uint i = startIndex; i < MAX_ACTIVE_TRANCHES; i++) {

        initialCapacityUsed += trancheAllocations[i];
        totalCapacity += trancheCapacities[i - startIndex];

        if (remainingAmount == 0) {
          // not breaking out of the for loop because we need the total capacity calculated above
          continue;
        }

        if (trancheAllocations[i] >= trancheCapacities[i - startIndex]) {
          // no capacity left in this tranche
          continue;
        }

        uint allocatedAmount = Math.min(trancheCapacities[i - startIndex] - trancheAllocations[i], remainingAmount);

        coverAllocations[i] = allocatedAmount;
        trancheAllocations[i] += allocatedAmount;
        remainingAmount -= allocatedAmount;

        packedCoverAllocations |= allocatedAmount << i * 32;
      }

      coverTrancheAllocations[allocationId] = packedCoverAllocations;

      if (remainingAmount != 0) {
        revert InsufficientCapacity();
      }
    }

    updateExpiringCoverAmounts(
      request.productId,
      _firstActiveTrancheId,
      Math.divCeil(block.timestamp + request.period, BUCKET_DURATION), // targetBucketId
      coverAllocations,
      true // isAllocation
    );

    updateStoredAllocations(
      request.productId,
      _firstActiveTrancheId,
      trancheAllocations
    );

    return (coverAllocationAmount, initialCapacityUsed, totalCapacity, allocationId);
  }

  function updateStoredAllocations(
    uint productId,
    uint firstTrancheId,
    uint[] memory allocations
  ) internal {

    uint firstGroupId = firstTrancheId / COVER_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + MAX_ACTIVE_TRANCHES - 1) / COVER_TRANCHE_GROUP_SIZE;
    uint groupCount = lastGroupId - firstGroupId + 1;

    TrancheAllocationGroup[] memory allocationGroups = new TrancheAllocationGroup[](groupCount);

    // min 2 and max 3 reads
    for (uint i = 0; i < groupCount; i++) {
      allocationGroups[i] = trancheAllocationGroups[productId][firstGroupId + i];
    }

    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {

      uint trancheId = firstTrancheId + i;
      uint trancheGroupIndex = trancheId / COVER_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % COVER_TRANCHE_GROUP_SIZE;

      // setItemAt does not mutate so we have to reassign it
      allocationGroups[trancheGroupIndex] = allocationGroups[trancheGroupIndex].setItemAt(
        trancheIndexInGroup,
        allocations[i].toUint48()
      );
    }

    uint16 currentBucket = (block.timestamp / BUCKET_DURATION).toUint16();

    for (uint i = 0; i < groupCount; i++) {
      trancheAllocationGroups[productId][firstGroupId + i] = allocationGroups[i].setLastBucketId(currentBucket);
    }
  }

  function updateExpiringCoverAmounts(
    uint productId,
    uint firstTrancheId,
    uint targetBucketId,
    uint[] memory coverTrancheAllocation,
    bool isAllocation
  ) internal {

    uint firstGroupId = firstTrancheId / BUCKET_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + MAX_ACTIVE_TRANCHES - 1) / BUCKET_TRANCHE_GROUP_SIZE;
    uint groupCount = lastGroupId - firstGroupId + 1;

    TrancheGroupBucket[] memory trancheGroupBuckets = new TrancheGroupBucket[](groupCount);

    // min 1 and max 2 reads
    for (uint i = 0; i < groupCount; i++) {
      trancheGroupBuckets[i] = expiringCoverBuckets[productId][targetBucketId][firstGroupId + i];
    }

    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {

      uint trancheId = firstTrancheId + i;
      uint trancheGroupId = trancheId / BUCKET_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % BUCKET_TRANCHE_GROUP_SIZE;

      uint32 expiringAmount = trancheGroupBuckets[trancheGroupId].getItemAt(trancheIndexInGroup);
      uint32 trancheAllocation = coverTrancheAllocation[i].toUint32();

      if (isAllocation) {
        expiringAmount += trancheAllocation;
      } else {
        expiringAmount -= trancheAllocation;
      }

      // setItemAt does not mutate so we have to reassign it
      trancheGroupBuckets[trancheGroupId] = trancheGroupBuckets[trancheGroupId].setItemAt(
        trancheIndexInGroup,
        expiringAmount
      );
    }

    for (uint i = 0; i < groupCount; i++) {
      expiringCoverBuckets[productId][targetBucketId][firstGroupId + i] = trancheGroupBuckets[i];
    }
  }

  /// Extends the period of an existing deposit until a tranche that ends further into the future
  ///
  /// @param tokenId           The id of the NFT that proves the ownership of the deposit.
  /// @param initialTrancheId  The id of the tranche the deposit is already a part of.
  /// @param newTrancheId      The id of the new tranche determining the new deposit period.
  /// @param topUpAmount       An optional amount if the user wants to also increase the deposit
  function extendDeposit(
    uint tokenId,
    uint initialTrancheId,
    uint newTrancheId,
    uint topUpAmount
  ) external whenNotPaused {

    // token id MAX_UINT is only used for pool manager fee tracking, no deposits allowed
    if(tokenId == MAX_UINT) {
      revert InvalidTokenId();
    }
    if (!stakingNFT.isApprovedOrOwner(msg.sender, tokenId)) {
      revert NotTokenOwnerOrApproved();
    }

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;

    {
      if (initialTrancheId >= newTrancheId) {
        revert NewTrancheEndsBeforeInitialTranche();
      }

      uint maxTrancheId = _firstActiveTrancheId + MAX_ACTIVE_TRANCHES - 1;

      if (newTrancheId > maxTrancheId) {
        revert RequestedTrancheIsNotYetActive();
      }
      if (newTrancheId < firstActiveTrancheId) {
        revert RequestedTrancheIsExpired();
      }
    }

    // if the initial tranche is expired, withdraw everything and make a new deposit
    // this requires the user to have grante sufficient allowance
    if (initialTrancheId < _firstActiveTrancheId) {

      uint[] memory trancheIds = new uint[](1);
      trancheIds[0] = initialTrancheId;

      (uint withdrawnStake, /* uint rewardsToWithdraw */) = withdraw(
        tokenId,
        true, // withdraw the deposit
        true, // withdraw the rewards
        trancheIds
      );

      depositTo(withdrawnStake + topUpAmount, newTrancheId, tokenId, msg.sender);

      return;
      // done! skip the rest of the function.
    }

    if (isPrivatePool) {
      if (msg.sender != manager) {
        revert PrivatePool();
      }
    }

    // if we got here - the initial tranche is still active. move all the shares to the new tranche

    // passing true because we mint reward shares
    processExpirations(true);

    Deposit memory initialDeposit = deposits[tokenId][initialTrancheId];
    Deposit memory updatedDeposit = deposits[tokenId][newTrancheId];

    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint newStakeShares;

    // calculate the new stake shares if there's a deposit top up
    if (topUpAmount > 0) {
      newStakeShares = _stakeSharesSupply * topUpAmount / _activeStake;
      activeStake = (_activeStake + topUpAmount).toUint96();
    }

    // calculate the new reward shares
    uint newRewardsShares = calculateNewRewardShares(
      initialDeposit.stakeShares,
      newStakeShares,
      initialTrancheId,
      newTrancheId,
      block.timestamp
    );

    {
      Tranche memory initialTranche = tranches[initialTrancheId];
      Tranche memory newTranche = tranches[newTrancheId];

      // move the shares to the new tranche
      initialTranche.stakeShares -= initialDeposit.stakeShares;
      initialTranche.rewardsShares -= initialDeposit.rewardsShares;
      newTranche.stakeShares += initialDeposit.stakeShares + newStakeShares.toUint128();
      newTranche.rewardsShares += (initialDeposit.rewardsShares + newRewardsShares).toUint128();

      // store the updated tranches
      tranches[initialTrancheId] = initialTranche;
      tranches[newTrancheId] = newTranche;
    }

    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    // if there already is a deposit on the new tranche, calculate its pending rewards
    if (updatedDeposit.lastAccNxmPerRewardShare != 0) {
      uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(updatedDeposit.lastAccNxmPerRewardShare);
      updatedDeposit.pendingRewards += (newEarningsPerShare * updatedDeposit.rewardsShares / ONE_NXM).toUint96();
    }

    // calculate the rewards for the deposit being extended and move them to the new deposit
    {
      uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(initialDeposit.lastAccNxmPerRewardShare);
      updatedDeposit.pendingRewards += (newEarningsPerShare * initialDeposit.rewardsShares / ONE_NXM).toUint96();
      updatedDeposit.pendingRewards += initialDeposit.pendingRewards;
    }

    updatedDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();
    updatedDeposit.stakeShares += (initialDeposit.stakeShares + newStakeShares).toUint128();
    updatedDeposit.rewardsShares += (initialDeposit.rewardsShares + newRewardsShares).toUint128();

    // everything is moved, delete the initial deposit
    delete deposits[tokenId][initialTrancheId];

    // store the new deposit.
    deposits[tokenId][newTrancheId] = updatedDeposit;

    // update global shares supply
    stakeSharesSupply = (_stakeSharesSupply + newStakeShares).toUint128();
    rewardsSharesSupply += newRewardsShares.toUint128();

    // transfer nxm from the staker and update the pool deposit balance
    tokenController.depositStakedNXM(msg.sender, topUpAmount, poolId);

    emit DepositExtended(msg.sender, tokenId, initialTrancheId, newTrancheId, topUpAmount);
  }

  function burnStake(uint amount) external onlyCoverContract {

    // TODO: block the pool if we perform 100% of the stake

    // passing false because neither the amount of shares nor the reward per second are changed
    processExpirations(false);

    // sload
    uint initialStake = activeStake;

    // leaving 1 wei to avoid division by zero
    uint burnAmount = amount >= initialStake ? initialStake - 1 : amount;
    tokenController.burnStakedNXM(burnAmount, poolId);

    // sstore
    activeStake = (initialStake - burnAmount).toUint96();

    emit StakeBurned(burnAmount);
  }

  /* views */

  function getActiveStake() external view returns (uint) {
    block.timestamp; // prevents warning about function being pure
    return 0;
  }

  function getProductStake(
    uint productId, uint coverExpirationDate
  ) public view returns (uint) {
    productId;
    coverExpirationDate;
    block.timestamp;
    return 0;
  }

  function getAllocatedProductStake(uint productId) public view returns (uint) {
    productId;
    block.timestamp;
    return 0;
  }

  function getFreeProductStake(
    uint productId, uint coverExpirationDate
  ) external view returns (uint) {
    productId;
    coverExpirationDate;
    block.timestamp;
    return 0;
  }

  /* pool management */

  function recalculateEffectiveWeights(uint[] calldata productIds) external {
    (
    uint globalCapacityRatio,
    /* globalMinPriceRatio */,
    /* initialPriceRatios */,
    /* capacityReductionRatios */
    uint[] memory capacityReductionRatios
    ) = ICover(coverContract).getPriceAndCapacityRatios(productIds);

    uint _totalEffectiveWeight = totalEffectiveWeight;

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      StakedProduct memory _product = products[productId];

      uint16 previousEffectiveWeight = _product.lastEffectiveWeight;
      _product.lastEffectiveWeight = getEffectiveWeight(
        productId,
        _product.targetWeight,
        globalCapacityRatio,
        capacityReductionRatios[i]
      );
      _totalEffectiveWeight = _totalEffectiveWeight - previousEffectiveWeight + _product.lastEffectiveWeight;
      products[productId] = _product;
    }
    totalEffectiveWeight = _totalEffectiveWeight.toUint32();
  }

  function setProducts(StakedProductParam[] memory params) external onlyManager {
    uint numProducts = params.length;
    uint[] memory productIds = new uint[](numProducts);

    for (uint i = 0; i < numProducts; i++) {
      productIds[i] = params[i].productId;
      if (!ICover(coverContract).isPoolAllowed(params[i].productId, poolId)) {
         revert PoolNotAllowedForThisProduct();
      }
    }
    (
      uint globalCapacityRatio,
      uint globalMinPriceRatio,
      uint[] memory initialPriceRatios,
      uint[] memory capacityReductionRatios
    ) = ICover(coverContract).getPriceAndCapacityRatios(productIds);

    uint _totalTargetWeight = totalTargetWeight;
    uint _totalEffectiveWeight = totalEffectiveWeight;
    bool targetWeightIncreased;

    for (uint i = 0; i < numProducts; i++) {
      StakedProductParam memory _param = params[i];
      StakedProduct memory _product = products[_param.productId];

      // if this is a new product
      if (_product.bumpedPriceUpdateTime == 0) {
        // initialize the bumpedPrice
        _product.bumpedPrice = initialPriceRatios[i].toUint96();
        _product.bumpedPriceUpdateTime = uint32(block.timestamp);
        // and make sure we set the price and the target weight
        if (!_param.setTargetPrice) {
          revert MustSetPriceForNewProducts();
        }
        if (!_param.setTargetWeight) {
          revert MustSetWeightForNewProducts();
        }
      }

      if (_param.setTargetPrice) {
        if (_param.targetPrice > TARGET_PRICE_DENOMINATOR) {
          revert TargetPriceTooHigh();
        }
        if (_param.targetPrice < globalMinPriceRatio) {
          revert TargetPriceBelowMin();
        }
        _product.targetPrice = _param.targetPrice;
      }

      // if setTargetWeight is set - effective weight must be recalculated
      if (_param.setTargetWeight && !_param.recalculateEffectiveWeight) {
        revert MustRecalculateEffectiveWeight();
      }

      // Must recalculate effectiveWeight to adjust targetWeight
      if (_param.recalculateEffectiveWeight) {

        if (_param.setTargetWeight) {
          if (_param.targetWeight > WEIGHT_DENOMINATOR) {
            revert TargetWeightTooHigh();
          }

          // totalEffectiveWeight cannot be above the max unless target  weight is not increased
          if (!targetWeightIncreased) {
            targetWeightIncreased = _param.targetWeight > _product.targetWeight;
          }
          _totalTargetWeight = _totalTargetWeight - _product.targetWeight + _param.targetWeight;
          _product.targetWeight = _param.targetWeight;
        }

        // subtract the previous effective weight
        _totalEffectiveWeight -= _product.lastEffectiveWeight;

        _product.lastEffectiveWeight = getEffectiveWeight(
          _param.productId,
          _product.targetWeight,
          globalCapacityRatio,
          capacityReductionRatios[i]
        );

        // add the new effective weight
        _totalEffectiveWeight += _product.lastEffectiveWeight;
      }

      // sstore
      products[_param.productId] = _product;

      emit ProductUpdated(_param.productId, _param.targetWeight, _param.targetPrice);
    }

    if (_totalTargetWeight > MAX_TOTAL_WEIGHT) {
      revert TotalTargetWeightExceeded();
    }

    if (targetWeightIncreased) {
      if (_totalEffectiveWeight > MAX_TOTAL_WEIGHT) {
        revert TotalEffectiveWeightExceeded();
      }
    }

    totalTargetWeight = _totalTargetWeight.toUint32();
    totalEffectiveWeight = _totalEffectiveWeight.toUint32();
  }

  function getEffectiveWeight(
    uint productId,
    uint targetWeight,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) internal view returns (uint16 effectiveWeight) {

    uint[] memory trancheCapacities = getTrancheCapacities(
      productId,
      block.timestamp / TRANCHE_DURATION, // first active tranche id
      MAX_ACTIVE_TRANCHES,
      globalCapacityRatio,
      capacityReductionRatio
    );

    uint totalCapacity = Math.sum(trancheCapacities);

    if (totalCapacity == 0) {
      return targetWeight.toUint16();
    }

    uint[] memory activeAllocations = getActiveAllocations(productId);
    uint totalAllocation = Math.sum(activeAllocations);
    uint actualWeight = Math.min(totalAllocation * WEIGHT_DENOMINATOR / totalCapacity, type(uint16).max);

    return Math.max(targetWeight, actualWeight).toUint16();
  }

  function _setInitialProducts(ProductInitializationParams[] memory params) internal {
    uint32 _totalTargetWeight = totalTargetWeight;

    for (uint i = 0; i < params.length; i++) {
      ProductInitializationParams memory param = params[i];
      StakedProduct storage _product = products[param.productId];
      if (param.targetPrice > TARGET_PRICE_DENOMINATOR) {
        revert TargetPriceTooHigh();
      }
      if (param.weight > WEIGHT_DENOMINATOR) {
        revert TargetWeightTooHigh();
      }
      _product.bumpedPrice = param.initialPrice;
      _product.bumpedPriceUpdateTime = uint32(block.timestamp);
      _product.targetPrice = param.targetPrice;
      _product.targetWeight = param.weight;
      _totalTargetWeight += param.weight;
    }

    if (_totalTargetWeight > MAX_TOTAL_WEIGHT) {
      revert TotalTargetWeightExceeded();
    }
    totalTargetWeight = _totalTargetWeight;
    totalEffectiveWeight = totalTargetWeight;
  }

  function setPoolFee(uint newFee) external onlyManager {

    if (newFee > maxPoolFee) {
      revert PoolFeeExceedsMax();
    }
    uint oldFee = poolFee;
    poolFee = uint8(newFee);

    // passing true because the amount of rewards shares changes
    processExpirations(true);

    uint fromTrancheId = block.timestamp / TRANCHE_DURATION;
    uint toTrancheId = fromTrancheId + MAX_ACTIVE_TRANCHES - 1;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    for (uint trancheId = fromTrancheId; trancheId <= toTrancheId; trancheId++) {

      // sload
      Deposit memory feeDeposit = deposits[MAX_UINT][trancheId];

      if (feeDeposit.rewardsShares == 0) {
        continue;
      }

      // update pending reward and reward shares
      uint newRewardPerRewardsShare = _accNxmPerRewardsShare.uncheckedSub(feeDeposit.lastAccNxmPerRewardShare);
      feeDeposit.pendingRewards += (newRewardPerRewardsShare * feeDeposit.rewardsShares / ONE_NXM).toUint96();
      feeDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();
      // TODO: would using tranche.rewardsShares give a better precision?
      feeDeposit.rewardsShares = (uint(feeDeposit.rewardsShares) * newFee / oldFee).toUint96();

      // sstore
      deposits[MAX_UINT][trancheId] = feeDeposit;
    }

    emit PoolFeeChanged(msg.sender, newFee);
  }

  function setPoolPrivacy(bool _isPrivatePool) external onlyManager {
    isPrivatePool = _isPrivatePool;

    emit PoolPrivacyChanged(msg.sender, _isPrivatePool);
  }

  function setPoolDescription(string memory ipfsDescriptionHash) external onlyManager {
    emit PoolDescriptionSet(ipfsDescriptionHash);
  }

  /* pricing code */

  function getPremium(
    uint productId,
    uint period,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint globalMinPrice,
    bool useFixedPrice
  ) internal returns (uint premium) {

    StakedProduct memory product = products[productId];
    uint targetPrice = Math.max(product.targetPrice, globalMinPrice);

    if (useFixedPrice) {
      return calculateFixedPricePremium(period, coverAmount, targetPrice);
    }

    (premium, product) = calculatePremium(
      product,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      targetPrice,
      block.timestamp
    );

    // sstore
    products[productId] = product;

    return premium;
  }

  function calculateFixedPricePremium(
    uint coverAmount,
    uint period,
    uint fixedPrice
  ) public pure returns (uint) {

    uint premiumPerYear =
      coverAmount
      * NXM_PER_ALLOCATION_UNIT
      * fixedPrice
      / TARGET_PRICE_DENOMINATOR;

    return premiumPerYear * period / 365 days;
  }

  function calculatePremium(
    StakedProduct memory product,
    uint period,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint targetPrice,
    uint currentBlockTimestamp
  ) public pure returns (uint premium, StakedProduct memory) {

    uint basePrice;
    {
      // use previously recorded bumped price and apply time based smoothing towards target price
      uint timeSinceLastUpdate = currentBlockTimestamp - product.bumpedPriceUpdateTime;
      uint priceDrop = PRICE_CHANGE_PER_DAY * timeSinceLastUpdate / 1 days;

      // basePrice = max(targetPrice, bumpedPrice - priceDrop)
      // rewritten to avoid underflow
      basePrice = product.bumpedPrice < targetPrice + priceDrop
        ? targetPrice
        : product.bumpedPrice - priceDrop;
    }

    // calculate the bumped price by applying the price bump
    uint priceBump = PRICE_BUMP_RATIO * coverAmount / totalCapacity;
    product.bumpedPrice = (basePrice + priceBump).toUint96();
    product.bumpedPriceUpdateTime = uint32(currentBlockTimestamp);

    // use calculated base price and apply surge pricing if applicable
    uint premiumPerYear = calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity
    );

    // calculate the premium for the requested period
    return (premiumPerYear * period / 365 days, product);
  }

  function calculatePremiumPerYear(
    uint basePrice,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity
  ) public pure returns (uint) {
    // cover amount has 2 decimals (100 = 1 unit)
    // scale coverAmount to 18 decimals and apply price percentage
    uint basePremium = coverAmount * NXM_PER_ALLOCATION_UNIT * basePrice / TARGET_PRICE_DENOMINATOR;
    uint finalCapacityUsed = initialCapacityUsed + coverAmount;

    // surge price is applied for the capacity used above SURGE_THRESHOLD_RATIO.
    // the surge price starts at zero and increases linearly.
    // to simplify things, we're working with fractions/ratios instead of percentages,
    // ie 0 to 1 instead of 0% to 100%, 100% = 1 (a unit).
    //
    // surgeThreshold = SURGE_THRESHOLD_RATIO / SURGE_THRESHOLD_DENOMINATOR
    //                = 90_00 / 100_00 = 0.9
    uint surgeStartPoint = totalCapacity * SURGE_THRESHOLD_RATIO / SURGE_THRESHOLD_DENOMINATOR;

    // Capacity and surge pricing
    //
    //        i        f                         s
    //   ▓▓▓▓▓░░░░░░░░░                          ▒▒▒▒▒▒▒▒▒▒
    //
    //  i - initial capacity used
    //  f - final capacity used
    //  s - surge start point

    // if surge does not apply just return base premium
    // i < f <= s case
    if (finalCapacityUsed <= surgeStartPoint) {
      return basePremium;
    }

    // calculate the premium amount incurred due to surge pricing
    uint amountOnSurge = finalCapacityUsed - surgeStartPoint;
    uint surgePremium = calculateSurgePremium(amountOnSurge, totalCapacity);

    // if the capacity start point is before the surge start point
    // the surge premium starts at zero, so we just return it
    // i <= s < f case
    if (initialCapacityUsed <= surgeStartPoint) {
      return basePremium + surgePremium;
    }

    // otherwise we need to subtract the part that was already used by other covers
    // s < i < f case
    uint amountOnSurgeSkipped = initialCapacityUsed - surgeStartPoint;
    uint surgePremiumSkipped = calculateSurgePremium(amountOnSurgeSkipped, totalCapacity);

    return basePremium + surgePremium - surgePremiumSkipped;
  }

  // Calculates the premium for a given cover amount starting with the surge point
  function calculateSurgePremium(
    uint amountOnSurge,
    uint totalCapacity
  ) public pure returns (uint) {

    // for every percent of capacity used, the surge price has a +2% increase per annum
    // meaning a +200% increase for 100%, ie x2 for a whole unit (100%) of capacity in ratio terms
    //
    // coverToCapacityRatio = amountOnSurge / totalCapacity
    // surgePriceStart = 0
    // surgePriceEnd = SURGE_PRICE_RATIO * coverToCapacityRatio
    //
    // surgePremium = amountOnSurge * surgePriceEnd / 2
    //              = amountOnSurge * SURGE_PRICE_RATIO * coverToCapacityRatio / 2
    //              = amountOnSurge * SURGE_PRICE_RATIO * amountOnSurge / totalCapacity / 2

    uint surgePremium = amountOnSurge * SURGE_PRICE_RATIO * amountOnSurge / totalCapacity / 2;

    // amountOnSurge has two decimals
    // dividing by ALLOCATION_UNITS_PER_NXM (=100) to normalize the result
    return surgePremium / ALLOCATION_UNITS_PER_NXM;
  }

}
