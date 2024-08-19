// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../abstract/Multicall.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/UncheckedMath.sol";
import "./StakingTypesLib.sol";
import "./StakingExtrasLib.sol";

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

  IStakingNFT internal immutable stakingNFT;
  INXMToken internal immutable nxm;
  ITokenController internal  immutable tokenController;
  address internal immutable coverContract;
  INXMMaster internal immutable masterContract;
  IStakingProducts internal immutable stakingProducts;

  /* constants */

  // 7 * 13 = 91
  uint public constant BUCKET_DURATION = 28 days;
  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8; // 7 whole quarters + 1 partial quarter

  uint public constant COVER_TRANCHE_GROUP_SIZE = 5;
  uint public constant BUCKET_TRANCHE_GROUP_SIZE = 8;

  uint public constant WEIGHT_DENOMINATOR = 100;
  uint public constant REWARDS_DENOMINATOR = 100_00;
  uint public constant POOL_FEE_DENOMINATOR = 100;

  // denominators for cover contract parameters
  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 100_00;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 100_00;

  // 1 nxm = 1e18
  uint internal constant ONE_NXM = 1 ether;

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
    uint _poolId
  ) external {

    if (msg.sender != address(stakingProducts)) {
      revert OnlyStakingProductsContract();
    }

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

    if (block.timestamp <= nxm.isLockedForMV(msg.sender) && msg.sender != manager()) {
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

    uint newRewardsShares = newStakeShares;

    // update deposit and pending reward
    {
      // conditional read
      Deposit memory deposit = requestTokenId == 0
        ? Deposit(0, 0, 0, 0)
        : deposits[tokenId][trancheId];

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

    _activeStake += amount;
    _stakeSharesSupply += newStakeShares;
    _rewardsSharesSupply += newRewardsShares;

    // transfer nxm from the staker and update the pool deposit balance
    tokenController.depositStakedNXM(msg.sender, amount, poolId);

    // update globals
    activeStake = _activeStake.toUint96();
    stakeSharesSupply = _stakeSharesSupply.toUint128();
    rewardsSharesSupply = _rewardsSharesSupply.toUint128();

    emit StakeDeposited(msg.sender, amount, trancheId, tokenId);
  }

  /// @notice Withdraws stake and rewards for a given token and specified tranches.
  /// @dev The function processes the withdrawal of both stake and rewards for a given staking NFT (`tokenId`).
  ///      Call StakingPoolViewer.getTokens to retrieve the relevant tranche IDs for a tokenId.
  ///      A stake can only be withdrawn if the the associated tranche where it was deposited has expired
  ///      Operates only when the contract is not paused.
  /// @param tokenId The ID of the staking NFT representing the deposited stake and its associated rewards.
  /// @param withdrawStake Whether to withdraw the total stake associated with the `tokenId`.
  /// @param withdrawRewards Whether to withdraw the total rewards associated with the `tokenId`.
  /// @param trancheIds An array of tranche IDs associated with the `tokenId`, used to specify which tranches to withdraw from.
  /// @return withdrawnStake The total stake withdrawn across all specified tranche IDs for the given `tokenId`.
  /// @return withdrawnRewards The total rewards withdrawn across all specified tranche IDs for the given `tokenId`.
  function withdraw(
    uint tokenId,
    bool withdrawStake,
    bool withdrawRewards,
    uint[] memory trancheIds
  ) public whenNotPaused returns (uint withdrawnStake, uint withdrawnRewards) {

    // pass false as it does not modify the share supply nor the reward per second
    processExpirations(true);

    WithdrawTrancheContext memory trancheContext;
    trancheContext.withdrawStake = withdrawStake;
    trancheContext.withdrawRewards = withdrawRewards;
    trancheContext._accNxmPerRewardsShare = accNxmPerRewardsShare;
    trancheContext._firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    trancheContext.managerLockedInGovernanceUntil = nxm.isLockedForMV(manager());
    trancheContext.destination = tokenId == 0 ? manager() : stakingNFT.ownerOf(tokenId);

    uint trancheCount = trancheIds.length;

    for (uint j = 0; j < trancheCount; j++) {

      uint trancheId = trancheIds[j];
      (uint trancheStakeToWithdraw, uint trancheRewardsToWithdraw) = _processTrancheWithdrawal(
        tokenId, 
        trancheId,
        trancheContext
      );

      withdrawnStake += trancheStakeToWithdraw;
      withdrawnRewards += trancheRewardsToWithdraw;

      emit Withdraw(trancheContext.destination, tokenId, trancheId, trancheStakeToWithdraw, trancheRewardsToWithdraw);
    }

    tokenController.withdrawNXMStakeAndRewards(
      trancheContext.destination,
      withdrawnStake,
      withdrawnRewards,
      poolId
    );

    return (withdrawnStake, withdrawnRewards);
  }
  
  function _processTrancheWithdrawal(
    uint tokenId,
    uint trancheId,
    WithdrawTrancheContext memory context
  ) internal returns (uint trancheStakeToWithdraw, uint trancheRewardsToWithdraw) {

    Deposit memory deposit = deposits[tokenId][trancheId];

    if (context.withdrawStake && trancheId < context._firstActiveTrancheId) {
      if (context.managerLockedInGovernanceUntil > block.timestamp) {
        revert ManagerNxmIsLockedForGovernanceVote();
      }

      uint stake = expiredTranches[trancheId].stakeAmountAtExpiry;
      uint _stakeSharesSupply = expiredTranches[trancheId].stakeSharesSupplyAtExpiry;
      trancheStakeToWithdraw = stake * deposit.stakeShares / _stakeSharesSupply;
      deposit.stakeShares = 0;
    }

    if (context.withdrawRewards) {
      uint accNxmPerRewardShareToUse = trancheId < context._firstActiveTrancheId
        ? expiredTranches[trancheId].accNxmPerRewardShareAtExpiry
        : context._accNxmPerRewardsShare;

      uint newRewardPerShare = accNxmPerRewardShareToUse.uncheckedSub(deposit.lastAccNxmPerRewardShare);
      trancheRewardsToWithdraw = newRewardPerShare * deposit.rewardsShares / ONE_NXM + deposit.pendingRewards;

      deposit.lastAccNxmPerRewardShare = accNxmPerRewardShareToUse.toUint96();
      deposit.pendingRewards = 0;
    }

    deposits[tokenId][trancheId] = deposit;

    return (trancheStakeToWithdraw, trancheRewardsToWithdraw);
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
  /// @param targetTrancheId   The id of the target tranche determining the new deposit period.
  /// @param topUpAmount       An optional amount if the user wants to also increase the deposit
  function extendDeposit(
    uint tokenId,
    uint initialTrancheId,
    uint targetTrancheId,
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

    if (topUpAmount > 0 && block.timestamp <= nxm.isLockedForMV(msg.sender)) {
      revert NxmIsLockedForGovernanceVote();
    }

    if (initialTrancheId >= targetTrancheId) {
      revert NewTrancheEndsBeforeInitialTranche();
    }

    {
      uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
      uint maxTrancheId = _firstActiveTrancheId + MAX_ACTIVE_TRANCHES - 1;

      if (targetTrancheId > maxTrancheId) {
        revert RequestedTrancheIsNotYetActive();
      }

      if (targetTrancheId < firstActiveTrancheId) {
        revert RequestedTrancheIsExpired();
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

        depositTo(withdrawnStake + topUpAmount, targetTrancheId, tokenId, msg.sender);

        return;
        // done! skip the rest of the function.
      }
    }

    // if we got here - the initial tranche is still active. move all the shares to the new tranche

    // passing true because we mint reward shares
    processExpirations(true);

    Deposit memory initialDeposit = deposits[tokenId][initialTrancheId];
    Deposit memory targetDeposit = deposits[tokenId][targetTrancheId];

    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    // new stake and rewards shares (excluding manager's fee reward shares)
    uint newShares;

    // calculate the amount of new shares and update the active stake
    if (topUpAmount > 0) {
      uint _activeStake = activeStake;
      newShares = _stakeSharesSupply * topUpAmount / _activeStake;
      activeStake = (_activeStake + topUpAmount).toUint96();
    }

    {
      // calculate and move the rewards from the initial deposit
      uint earningsPerShare = _accNxmPerRewardsShare.uncheckedSub(initialDeposit.lastAccNxmPerRewardShare);
      uint newPendingRewards = (earningsPerShare * initialDeposit.rewardsShares / ONE_NXM).toUint96();
      targetDeposit.pendingRewards += (initialDeposit.pendingRewards + newPendingRewards).toUint96();
    }

    // calculate the rewards on the new deposit if it had stake
    if (targetDeposit.rewardsShares != 0) {
      uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(targetDeposit.lastAccNxmPerRewardShare);
      targetDeposit.pendingRewards += (newEarningsPerShare * targetDeposit.rewardsShares / ONE_NXM).toUint96();
    }

    // update accumulator and shares
    targetDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();
    targetDeposit.stakeShares += (initialDeposit.stakeShares + newShares).toUint128();
    targetDeposit.rewardsShares += (initialDeposit.rewardsShares + newShares).toUint128();

    uint initialFeeRewardShares = initialDeposit.rewardsShares * poolFee / (POOL_FEE_DENOMINATOR - poolFee);
    uint newFeeRewardShares = newShares * poolFee / (POOL_FEE_DENOMINATOR - poolFee);

    // update manager's fee deposits
    deposits[0][initialTrancheId].rewardsShares -= initialFeeRewardShares.toUint128();
    deposits[0][targetTrancheId].rewardsShares += (initialFeeRewardShares + newFeeRewardShares).toUint128();

    // update tranches
    {
      Tranche memory initialTranche = tranches[initialTrancheId]; // sload

      // update
      initialTranche.stakeShares -= initialDeposit.stakeShares;
      initialTranche.rewardsShares -= (initialDeposit.rewardsShares + initialFeeRewardShares).toUint128();

      tranches[initialTrancheId] = initialTranche; // sstore
    }

    {
      Tranche memory targetTranche = tranches[targetTrancheId]; // sload

      // update
      targetTranche.stakeShares += (initialDeposit.stakeShares + newShares).toUint128();
      targetTranche.rewardsShares += initialDeposit.rewardsShares;
      targetTranche.rewardsShares += (initialFeeRewardShares + newFeeRewardShares).toUint128();

      tranches[targetTrancheId] = targetTranche; // store
    }

    // delete the initial deposit and store the new deposit
    delete deposits[tokenId][initialTrancheId];
    deposits[tokenId][targetTrancheId] = targetDeposit;

    // update global shares supply
    stakeSharesSupply = (_stakeSharesSupply + newShares).toUint128();
    rewardsSharesSupply = (_rewardsSharesSupply + newShares + newFeeRewardShares).toUint128();

    // transfer nxm from the staker and update the pool deposit balance
    tokenController.depositStakedNXM(msg.sender, topUpAmount, poolId);

    emit DepositExtended(msg.sender, tokenId, initialTrancheId, targetTrancheId, topUpAmount);
  }

  function burnStake(uint amount, BurnStakeParams calldata params) external onlyCoverContract {
    // passing false because neither the amount of shares nor the reward per second are changed
    processExpirations(false);

    // burn stake
    {
      // sload
      uint _activeStake = activeStake;

      // if all stake is burned, leave 1 wei and close pool
      if (amount >= _activeStake) {
        amount = _activeStake - 1;
        isHalted = true;
      }

      tokenController.burnStakedNXM(amount, poolId);

      // sstore & log event
      activeStake = (_activeStake - amount).toUint96();
      emit StakeBurned(amount);
    }

    // do not deallocate if the cover has expired (grace period)
    if (params.start + params.period <= block.timestamp) {
      return;
    }

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
  }

  /* pool management */

  function setPoolFee(uint newFee) external onlyManager {

    if (newFee > maxPoolFee) {
      revert PoolFeeExceedsMax();
    }

    // passing true because the amount of rewards shares changes
    processExpirations(true);

    uint fromTrancheId = block.timestamp / TRANCHE_DURATION;
    uint toTrancheId = fromTrancheId + MAX_ACTIVE_TRANCHES - 1;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _rewardsSharesSupply = rewardsSharesSupply;

    for (uint trancheId = fromTrancheId; trancheId <= toTrancheId; trancheId++) {

      // sload
      Deposit memory feeDeposit = deposits[0][trancheId];
      Tranche memory tranche = tranches[trancheId];

      tranche.rewardsShares -= feeDeposit.rewardsShares;
      _rewardsSharesSupply -= feeDeposit.rewardsShares;

      // update pending rewards
      uint newRewardPerRewardsShare = _accNxmPerRewardsShare.uncheckedSub(feeDeposit.lastAccNxmPerRewardShare);
      feeDeposit.pendingRewards += (newRewardPerRewardsShare * feeDeposit.rewardsShares / ONE_NXM).toUint96();
      feeDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare.toUint96();

      feeDeposit.rewardsShares = (tranche.rewardsShares * newFee / (POOL_FEE_DENOMINATOR - newFee)).toUint128();
      tranche.rewardsShares += feeDeposit.rewardsShares;
      _rewardsSharesSupply += feeDeposit.rewardsShares;

      // sstore
      deposits[0][trancheId] = feeDeposit;
      tranches[trancheId] = tranche;
    }

    rewardsSharesSupply = _rewardsSharesSupply.toUint128();
    poolFee = uint8(newFee);

    emit PoolFeeChanged(msg.sender, newFee);
  }

  function setPoolPrivacy(bool _isPrivatePool) external onlyManager {
    isPrivatePool = _isPrivatePool;
    emit PoolPrivacyChanged(msg.sender, _isPrivatePool);
  }

  /* fixes */

  function updateRewardsShares(
    uint trancheId,
    uint[] calldata tokenIds
  ) external {

    if (msg.sender != coverContract) {
      revert OnlyCoverContract();
    }

    uint _rewardsSharesSupply = StakingExtrasLib.updateRewardsShares(
      // storage refs
      deposits, tranches,
      // state
      accNxmPerRewardsShare, rewardsSharesSupply, poolFee,
      // inputs
      trancheId, tokenIds
    );

    rewardsSharesSupply = _rewardsSharesSupply.toUint128();
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
    return (
      deposits[tokenId][trancheId].lastAccNxmPerRewardShare,
      deposits[tokenId][trancheId].pendingRewards,
      deposits[tokenId][trancheId].stakeShares,
      deposits[tokenId][trancheId].rewardsShares
    );
  }

  function getTranche(uint trancheId) external override view returns (
    uint stakeShares,
    uint rewardsShares
  ) {
    return (
      tranches[trancheId].stakeShares,
      tranches[trancheId].rewardsShares
    );
  }

  function getExpiredTranche(uint trancheId) external override view returns (
    uint accNxmPerRewardShareAtExpiry,
    uint stakeAmountAtExpiry,
    uint stakeSharesSupplyAtExpiry
  ) {
    return (
      expiredTranches[trancheId].accNxmPerRewardShareAtExpiry,
      expiredTranches[trancheId].stakeAmountAtExpiry,
      expiredTranches[trancheId].stakeSharesSupplyAtExpiry
    );
  }

}
