// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../abstract/Multicall.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IStakingProducts.sol";
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
  uint128 internal stakeSharesSupply;

  // supply of pool rewards shares used by tranches
  uint128 internal rewardsSharesSupply;

  // slot 2
  // accumulated rewarded nxm per reward share
  uint96 internal accNxmPerRewardsShare;

  // currently active staked nxm amount
  uint96 internal activeStake;

  uint32 internal firstActiveTrancheId;
  uint32 internal firstActiveBucketId;

  // slot 3
  // timestamp when accNxmPerRewardsShare was last updated
  uint32 internal lastAccNxmUpdate;
  // current nxm reward per second for the entire pool
  // applies to active stake only and does not need update on deposits
  uint96 internal rewardPerSecond;

  uint40 internal poolId;
  uint24 internal lastAllocationId;

  bool public override isPrivatePool;
  bool public override isHalted;

  uint8 internal poolFee;
  uint8 internal maxPoolFee;

  // 32 bytes left in slot 3

  // tranche id => tranche data
  mapping(uint => Tranche) internal tranches;

  // tranche id => expired tranche data
  mapping(uint => ExpiredTranche) internal expiredTranches;

  // reward bucket id => RewardBucket
  mapping(uint => uint) public rewardPerSecondCut;

  // product id => tranche group id => active allocations for a tranche group
  mapping(uint => mapping(uint => TrancheAllocationGroup)) public trancheAllocationGroups;

  // product id => bucket id => bucket tranche group id => tranche group's expiring cover amounts
  mapping(uint => mapping(uint => mapping(uint => TrancheGroupBucket))) public expiringCoverBuckets;

  // cover id => per tranche cover amounts (8 32-bit values, one per tranche, packed in a slot)
  // starts with the first active tranche at the time of cover buy
  mapping(uint => uint) public coverTrancheAllocations;

  // token id => tranche id => deposit data
  mapping(uint => mapping(uint => Deposit)) public deposits;

  /* immutables */

  IStakingNFT public immutable stakingNFT;
  INXMToken public immutable nxm;
  ITokenController public  immutable tokenController;
  address public immutable coverContract;
  INXMMaster public immutable masterContract;
  IStakingProducts public immutable stakingProducts;

  /* constants */

  // 7 * 13 = 91
  uint public constant BUCKET_DURATION = 28 days;
  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8; // 7 whole quarters + 1 partial quarter

  uint public constant COVER_TRANCHE_GROUP_SIZE = 5;
  uint public constant BUCKET_TRANCHE_GROUP_SIZE = 8;

  uint public constant REWARD_BONUS_PER_TRANCHE_RATIO = 10_00; // 10.00%
  uint public constant REWARD_BONUS_PER_TRANCHE_DENOMINATOR = 100_00;
  uint public constant WEIGHT_DENOMINATOR = 100;
  uint public constant REWARDS_DENOMINATOR = 100_00;
  uint public constant POOL_FEE_DENOMINATOR = 100;

  // denominators for cover contract parameters
  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 100_00;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 100_00;

  // +2% for every 1%, ie +200% for 100%

  // 1 nxm = 1e18
  uint public constant ONE_NXM = 1 ether;

  // internally we store capacity using 2 decimals
  // 1 nxm of capacity is stored as 100
  uint public constant ALLOCATION_UNITS_PER_NXM = 100;

  // given capacities have 2 decimals
  // smallest unit we can allocate is 1e18 / 100 = 1e16 = 0.01 NXM
  uint public constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;

  modifier onlyCoverContract {
    if (msg.sender != coverContract) {
      revert OnlyCoverContract();
    }
    _;
  }

  modifier onlyManager {
    if (msg.sender != manager()) {
      revert OnlyManager();
    }
    _;
  }

  modifier whenNotPaused {
    if (masterContract.isPause()) {
      revert SystemPaused();
    }
    _;
  }

  modifier whenNotHalted {
    if (isHalted) {
      revert PoolHalted();
    }
    _;
  }

  constructor (
    address _stakingNFT,
    address _token,
    address _coverContract,
    address _tokenController,
    address _master,
    address _stakingProducts
  ) {
    stakingNFT = IStakingNFT(_stakingNFT);
    nxm = INXMToken(_token);
    coverContract = _coverContract;
    tokenController = ITokenController(_tokenController);
    masterContract = INXMMaster(_master);
    stakingProducts = IStakingProducts(_stakingProducts);
  }

  function initialize(
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    uint _poolId,
    string  calldata ipfsDescriptionHash
  ) external onlyCoverContract {

    if (_initialPoolFee > _maxPoolFee) {
      revert PoolFeeExceedsMax();
    }

    if (_maxPoolFee >= 100) {
      revert MaxPoolFeeAbove100();
    }

    isPrivatePool = _isPrivatePool;
    poolFee = uint8(_initialPoolFee);
    maxPoolFee = uint8(_maxPoolFee);
    poolId = _poolId.toUint40();

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

        emit BucketExpired(_firstActiveBucketId - 1);
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

        emit TrancheExpired(_firstActiveTrancheId);
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
  ) public whenNotPaused whenNotHalted returns (uint tokenId) {

    if (isPrivatePool && msg.sender != manager()) {
      revert PrivatePool();
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

    // deposit to token id = 0 is not allowed
    // we treat it as a flag to create a new token
    if (requestTokenId == 0) {
      address to = destination == address(0) ? msg.sender : destination;
      tokenId = stakingNFT.mint(poolId, to);
    } else {
      // validate token id exists and belongs to this pool
      // stakingPoolOf() reverts for non-existent tokens
      if (stakingNFT.stakingPoolOf(requestTokenId) != poolId) {
        revert InvalidStakingPoolForToken();
      }
      // validate only the token owner or an approved address can deposit
      if (!stakingNFT.isApprovedOrOwner(msg.sender, requestTokenId)) {
        revert NotTokenOwnerOrApproved();
      }

      tokenId = requestTokenId;
    }

    uint newStakeShares = _stakeSharesSupply == 0
      ? Math.sqrt(amount)
      : _stakeSharesSupply * amount / _activeStake;

    uint newRewardsShares;

    // update deposit and pending reward
    {
      // conditional read
      Deposit memory deposit = requestTokenId == 0
        ? Deposit(0, 0, 0, 0)
        : deposits[tokenId][trancheId];

      newRewardsShares = calculateNewRewardShares(
        deposit.stakeShares, // initialStakeShares
        newStakeShares, // newStakeShares
        trancheId, // initialTrancheId
        trancheId, // newTrancheId, the same as initialTrancheId in this case
        block.timestamp
      );

      // if we're increasing an existing deposit
      if (deposit.rewardsShares != 0) {
        uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(deposit.lastAccNxmPerRewardShare);
        deposit.pendingRewards += (newEarningsPerShare * deposit.rewardsShares / ONE_NXM).toUint96();
      }

      deposit.stakeShares += newStakeShares.toUint128();
      deposit.rewardsShares += newRewardsShares.toUint128();
      deposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();

      // store
      deposits[tokenId][trancheId] = deposit;
    }

    // update pool manager's reward shares
    {
      Deposit memory feeDeposit = deposits[0][trancheId];

      {
        // create fee deposit reward shares
        uint newFeeRewardShares = newRewardsShares * poolFee / (POOL_FEE_DENOMINATOR - poolFee);
        newRewardsShares += newFeeRewardShares;

        // calculate rewards until now
        uint newRewardPerShare = _accNxmPerRewardsShare.uncheckedSub(feeDeposit.lastAccNxmPerRewardShare);
        feeDeposit.pendingRewards += (newRewardPerShare * feeDeposit.rewardsShares / ONE_NXM).toUint96();
        feeDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();
        feeDeposit.rewardsShares += newFeeRewardShares.toUint128();
      }

      deposits[0][trancheId] = feeDeposit;
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

    uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager());

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
          if (managerLockedInGovernanceUntil > block.timestamp) {
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
          deposit.lastAccNxmPerRewardShare = accNxmPerRewardShareToUse.toUint96();
          deposit.pendingRewards = 0;
        }

        emit Withdraw(msg.sender, tokenId, trancheId, trancheStakeToWithdraw, trancheRewardsToWithdraw);
      }

      deposits[tokenId][trancheId] = deposit;
    }

    address destination = tokenId == 0
      ? manager()
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

    // prevent allocation requests (edits and forced expirations) for expired covers
    if (request.allocationId != 0) {
      uint expirationBucketId = Math.divCeil(request.previousExpiration, BUCKET_DURATION);
      if (coverTrancheAllocations[request.allocationId] == 0 || firstActiveBucketId >= expirationBucketId) {
        revert AlreadyDeallocated(request.allocationId);
      }
    }

    uint[] memory trancheAllocations = request.allocationId == 0
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
        block.timestamp / TRANCHE_DURATION, // firstActiveTrancheId
        trancheAllocations
      );

      // update coverTrancheAllocations when deallocating so we can track deallocation
      delete coverTrancheAllocations[request.allocationId];
      emit Deallocated(request.allocationId);
      return (0, 0);
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
    premium = stakingProducts.getPremium(
      poolId,
      request.productId,
      request.period,
      coverAllocationAmount,
      initialCapacityUsed,
      totalCapacity,
      request.globalMinPrice,
      request.useFixedPrice,
      NXM_PER_ALLOCATION_UNIT,
      ALLOCATION_UNITS_PER_NXM
    );

    // add new rewards
    {
      if (request.rewardRatio > REWARDS_DENOMINATOR) {
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
    uint currentBucket = block.timestamp / BUCKET_DURATION;
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
  ) public view returns (uint[] memory trancheCapacities) {

    // will revert if with unprocessed expirations
    if (firstTrancheId < block.timestamp / TRANCHE_DURATION) {
      revert RequestedTrancheIsExpired();
    }

    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    trancheCapacities = new uint[](trancheCount);

    if (_stakeSharesSupply == 0) {
      return trancheCapacities;
    }

    // TODO: can we get rid of the extra call to SP here?
    uint multiplier =
      capacityRatio
      * (CAPACITY_REDUCTION_DENOMINATOR - reductionRatio)
      * stakingProducts.getProductTargetWeight(poolId, productId);

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

    if (request.allocationId == 0) {
      allocationId = ++lastAllocationId;
    } else {
      allocationId = request.allocationId;
    }

    coverAllocationAmount = Math.divCeil(amount, NXM_PER_ALLOCATION_UNIT);

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint[] memory coverAllocations = new uint[](MAX_ACTIVE_TRANCHES);

    {
      uint firstTrancheIdToUse = (block.timestamp + request.period + request.gracePeriod) / TRANCHE_DURATION;
      uint startIndex = firstTrancheIdToUse - _firstActiveTrancheId;

      uint[] memory trancheCapacities = getTrancheCapacities(
        request.productId,
        _firstActiveTrancheId,
        MAX_ACTIVE_TRANCHES, // count
        request.globalCapacityRatio,
        request.capacityReductionRatio
      );

      uint remainingAmount = coverAllocationAmount;
      uint carryOver;
      uint packedCoverAllocations;

      for (uint i = 0; i < startIndex; i++) {

        uint allocated = trancheAllocations[i];
        uint capacity = trancheCapacities[i];

        if (allocated > capacity) {
          carryOver += allocated - capacity;
        } else if (carryOver > 0) {
          carryOver -= Math.min(carryOver, capacity - allocated);
        }
      }

      initialCapacityUsed = carryOver;

      for (uint i = startIndex; i < MAX_ACTIVE_TRANCHES; i++) {

        initialCapacityUsed += trancheAllocations[i];
        totalCapacity += trancheCapacities[i];

        if (trancheAllocations[i] >= trancheCapacities[i]) {
          // carry over overallocation
          carryOver += trancheAllocations[i] - trancheCapacities[i];
          continue;
        }

        if (remainingAmount == 0) {
          // not breaking out of the for loop because we need the total capacity calculated above
          continue;
        }

        uint allocatedAmount;

        {
          uint available = trancheCapacities[i] - trancheAllocations[i];

          if (carryOver > available) {
            // no capacity left in this tranche
            carryOver -= available;
            continue;
          }

          available -= carryOver;
          carryOver = 0;
          allocatedAmount = Math.min(available, remainingAmount);
        }

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
  ) external whenNotPaused whenNotHalted {

    // token id 0 is only used for pool manager fee tracking, no deposits allowed
    if (tokenId == 0) {
      revert InvalidTokenId();
    }

    // validate token id exists and belongs to this pool
    // stakingPoolOf() reverts for non-existent tokens
    if (stakingNFT.stakingPoolOf(tokenId) != poolId) {
      revert InvalidStakingPoolForToken();
    }

    if (isPrivatePool && msg.sender != manager()) {
      revert PrivatePool();
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

  function burnStake(uint amount, BurnStakeParams calldata params) external onlyCoverContract {
    // passing false because neither the amount of shares nor the reward per second are changed
    processExpirations(false);

    // sload
    uint _activeStake = activeStake;

    // If all stake is burned, leave 1 wei and close pool
    if (amount >= _activeStake) {
      amount = _activeStake - 1;
      isHalted = true;
    }

    tokenController.burnStakedNXM(amount, poolId);

    // sstore
    activeStake = (_activeStake - amount).toUint96();

    uint initialPackedCoverTrancheAllocation = coverTrancheAllocations[params.allocationId];
    uint[] memory activeAllocations = getActiveAllocations(params.productId);

    uint currentFirstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint[] memory coverDeallocations = new uint[](MAX_ACTIVE_TRANCHES);

    uint remainingDeallocationAmount = params.deallocationAmount / NXM_PER_ALLOCATION_UNIT;
    uint newPackedCoverAllocations;

    // number of already expired tranches to skip
    // currentFirstActiveTranche - previousFirstActiveTranche
    uint offset = currentFirstActiveTrancheId - (params.start / TRANCHE_DURATION);

    // iterate the tranches backward to remove allocation from future tranches first
    for (uint i = MAX_ACTIVE_TRANCHES - 1; i >= offset; i--) {
      // i = tranche index when the allocation was made
      // i - offset = index of the same tranche but in currently active tranches arrays
      uint currentTrancheIdx = i - offset;

      uint allocated = uint32(initialPackedCoverTrancheAllocation >> (i * 32));
      uint deallocateAmount = Math.min(allocated, remainingDeallocationAmount);

      activeAllocations[currentTrancheIdx] -= deallocateAmount;
      coverDeallocations[currentTrancheIdx] = deallocateAmount;
      newPackedCoverAllocations |= (allocated - deallocateAmount) << i * 32;

      remainingDeallocationAmount -= deallocateAmount;

      // avoids underflow in the for decrement loop
      if (i == 0) {
        break;
      }
    }

    coverTrancheAllocations[params.allocationId] = newPackedCoverAllocations;

    updateExpiringCoverAmounts(
      params.productId,
      currentFirstActiveTrancheId,
      Math.divCeil(params.start + params.period, BUCKET_DURATION), // targetBucketId
      coverDeallocations,
      false // isAllocation
    );

    updateStoredAllocations(
      params.productId,
      currentFirstActiveTrancheId,
      activeAllocations
    );

    emit StakeBurned(amount);
  }

  /* pool management */

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
      Deposit memory feeDeposit = deposits[0][trancheId];

      if (feeDeposit.rewardsShares == 0) {
        continue;
      }

      // update pending reward and reward shares
      uint newRewardPerRewardsShare = _accNxmPerRewardsShare.uncheckedSub(feeDeposit.lastAccNxmPerRewardShare);
      feeDeposit.pendingRewards += (newRewardPerRewardsShare * feeDeposit.rewardsShares / ONE_NXM).toUint96();
      feeDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();
      // TODO: would using tranche.rewardsShares give a better precision?
      feeDeposit.rewardsShares = (uint(feeDeposit.rewardsShares) * newFee / oldFee).toUint128();

      // sstore
      deposits[0][trancheId] = feeDeposit;
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

  /* getters */

  function manager() public override view returns (address) {
    return tokenController.getStakingPoolManager(poolId);
  }

  function getPoolId() external override view returns (uint) {
    return poolId;
  }

  function getPoolFee() external override view returns (uint) {
    return poolFee;
  }

  function getMaxPoolFee() external override view returns (uint) {
    return maxPoolFee;
  }

  function getActiveStake() external override view returns (uint) {
    return activeStake;
  }

  function getStakeSharesSupply() external override view returns (uint) {
    return stakeSharesSupply;
  }

  function getRewardsSharesSupply() external override view returns (uint) {
    return rewardsSharesSupply;
  }

  function getRewardPerSecond() external override view returns (uint) {
    return rewardPerSecond;
  }

  function getAccNxmPerRewardsShare() external override view returns (uint) {
    return accNxmPerRewardsShare;
  }

  function getLastAccNxmUpdate() external override view returns (uint) {
    return lastAccNxmUpdate;
  }

  function getFirstActiveTrancheId() external override view returns (uint) {
    return firstActiveTrancheId;
  }

  function getFirstActiveBucketId() external override view returns (uint) {
    return firstActiveBucketId;
  }

  function getNextAllocationId() external override view returns (uint) {
    return lastAllocationId + 1;
  }

  function getDeposit(uint tokenId, uint trancheId) external override view returns (
    uint lastAccNxmPerRewardShare,
    uint pendingRewards,
    uint stakeShares,
    uint rewardsShares
  ) {
    Deposit memory deposit = deposits[tokenId][trancheId];
    return (
      deposit.lastAccNxmPerRewardShare,
      deposit.pendingRewards,
      deposit.stakeShares,
      deposit.rewardsShares
    );
  }

  function getTranche(uint trancheId) external override view returns (
    uint stakeShares,
    uint rewardsShares
  ) {
    Tranche memory tranche = tranches[trancheId];
    return (
      tranche.stakeShares,
      tranche.rewardsShares
    );
  }

  function getExpiredTranche(uint trancheId) external override view returns (
    uint accNxmPerRewardShareAtExpiry,
    uint stakeAmountAtExpiry,
    uint stakeSharesSupplyAtExpiry
  ) {
    ExpiredTranche memory expiredTranche = expiredTranches[trancheId];
    return (
      expiredTranche.accNxmPerRewardShareAtExpiry,
      expiredTranche.stakeAmountAtExpiry,
      expiredTranche.stakeSharesSupplyAtExpiry
    );
  }

}
