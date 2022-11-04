// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/utils/Strings.sol";
import "solmate/src/tokens/ERC721.sol";

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ITokenController.sol";
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

contract StakingPool is IStakingPool, ERC721 {
  using StakingTypesLib for TrancheAllocationGroup;
  using StakingTypesLib for BucketTrancheGroup;
  using SafeUintCast for uint;
  using UncheckedMath for uint;

  /* storage */

  uint poolId;

  // currently active staked nxm amount
  uint public activeStake;

  // supply of pool stake shares used by tranches
  uint public stakeSharesSupply;

  // supply of pool rewards shares used by tranches
  uint public rewardsSharesSupply;

  // current nxm reward per second for the entire pool
  // applies to active stake only and does not need update on deposits
  uint public rewardPerSecond;

  // accumulated rewarded nxm per reward share
  uint public accNxmPerRewardsShare;

  // timestamp when accNxmPerRewardsShare was last updated
  uint public lastAccNxmUpdate;

  uint public firstActiveTrancheId;
  uint public firstActiveBucketId;

  bool public isPrivatePool;
  uint8 public poolFee;
  uint8 public maxPoolFee;
  uint32 public totalEffectiveWeight;
  uint32 public totalTargetWeight;

  // erc721 supply
  uint public totalSupply;

  // tranche id => tranche data
  mapping(uint => Tranche) public tranches;

  // tranche id => expired tranche data
  mapping(uint => ExpiredTranche) public expiredTranches;

  // reward bucket id => RewardBucket
  mapping(uint => RewardBucket) public rewardBuckets;

  // product id => tranche group id => active allocations for a tranche group
  mapping(uint => mapping(uint => TrancheAllocationGroup)) public activeAllocations;

  // product id => bucket id => bucket tranche group id => tranche group's expiring cover amounts
  mapping(uint => mapping(uint => mapping(uint => BucketTrancheGroup))) public expiringCoverBuckets;

  // cover id => per tranche cover amounts (8 32-bit values, one per tranche, packed in a slot)
  mapping(uint => uint) public coverTrancheAllocations;

  // product id => Product
  mapping(uint => StakedProduct) public products;

  // token id => tranche id => deposit data
  mapping(uint => mapping(uint => Deposit)) public deposits;

  /* immutables */

  INXMToken public immutable nxm;
  ITokenController public  immutable tokenController;
  address public immutable coverContract;

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
  uint public constant MAX_WEIGHT_MULTIPLIER = 20;
  uint public constant MAX_TOTAL_WEIGHT = WEIGHT_DENOMINATOR * MAX_WEIGHT_MULTIPLIER;
  uint public constant REWARDS_DENOMINATOR = 100_00;
  uint public constant POOL_FEE_DENOMINATOR = 100;

  // denominators for cover contract parameters
  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 100_00;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 100_00;
  uint public constant INITIAL_PRICE_DENOMINATOR = 100_00;
  uint public constant TARGET_PRICE_DENOMINATOR = 100_00;

  // base price bump is +0.2% for each 1% of capacity used, ie +20% for 100%
  // 20% = 0.2
  uint public constant PRICE_BUMP_RATIO = 0.2 ether;

  // next price smoothing
  // 0.005 ether = 0.5% out of 1e18
  uint public constant PRICE_CHANGE_PER_DAY = 0.005 ether;

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

  modifier onlyCoverContract {
    require(msg.sender == coverContract, "StakingPool: Only Cover contract can call this function");
    _;
  }

  modifier onlyManager {
    require(isApprovedOrOwner(msg.sender, 0), "StakingPool: Only pool manager can call this function");
    _;
  }

  constructor (
    address _token,
    address _coverContract,
    ITokenController _tokenController
  ) ERC721("", "") {
    nxm = INXMToken(_token);
    coverContract = _coverContract;
    tokenController = _tokenController;
  }

  function initialize(
    address _manager,
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    ProductInitializationParams[] calldata params,
    uint _poolId
  ) external onlyCoverContract {

    require(_initialPoolFee <= _maxPoolFee, "StakingPool: Pool fee should not exceed max pool fee");
    require(_maxPoolFee < 100, "StakingPool: Max pool fee cannot be 100%");

    isPrivatePool = _isPrivatePool;

    poolFee = uint8(_initialPoolFee);
    maxPoolFee = uint8(_maxPoolFee);

    poolId = _poolId;
    name = string(abi.encodePacked("Nexus Mutual Staking Pool #", Strings.toString(_poolId)));
    symbol = string(abi.encodePacked("NMSP-", Strings.toString(_poolId)));

    _setInitialProducts(params);

    // create ownership nft
    totalSupply = 1;
    _mint(_manager, 0);
  }

  function isApprovedOrOwner(address spender, uint tokenId) public view returns (bool) {
    address owner = ownerOf(tokenId);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[tokenId];
  }

  function tokenURI(uint) public pure override returns (string memory) {
    return "";
  }

  // used to transfer all nfts when a user switches the membership to a new address
  function operatorTransfer(
    address from,
    address to,
    uint[] calldata tokenIds
  ) external onlyCoverContract {
    uint length = tokenIds.length;
    for (uint i = 0; i < length; i++) {
      transferFrom(from, to, tokenIds[i]);
    }
  }

  // updateUntilCurrentTimestamp forces rewards update until current timestamp not just until
  // bucket/tranche expiry timestamps. Must be true when changing shares or reward per second.
  function updateTranches(bool updateUntilCurrentTimestamp) public {

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
      lastAccNxmUpdate = block.timestamp;
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

        uint newAccNxmPerRewardsShare = elapsed * _rewardPerSecond / _rewardsSharesSupply;
        _accNxmPerRewardsShare = _accNxmPerRewardsShare.uncheckedAdd(newAccNxmPerRewardsShare);

        _rewardPerSecond -= rewardBuckets[_firstActiveBucketId].rewardPerSecondCut;
        _lastAccNxmUpdate = bucketStartTime;

        continue;
      }

      // expire a tranche
      // each tranche contains shares - we expire them when the tranche *ends*
      // TODO: check if we have to expire the tranche
      {
        uint trancheEndTime = (_firstActiveTrancheId + 1) * TRANCHE_DURATION;
        uint elapsed = trancheEndTime - _lastAccNxmUpdate;
        uint newAccNxmPerRewardsShare = elapsed * _rewardPerSecond / _rewardsSharesSupply;
        _accNxmPerRewardsShare = _accNxmPerRewardsShare.uncheckedAdd(newAccNxmPerRewardsShare);
        _lastAccNxmUpdate = trancheEndTime;

        // SSTORE
        expiredTranches[_firstActiveTrancheId] = ExpiredTranche(
          _accNxmPerRewardsShare, // accNxmPerRewardShareAtExpiry
          _activeStake, // stakeAmountAtExpiry
          _stakeSharesSupply // stakeShareSupplyAtExpiry
        );

        // SLOAD and then SSTORE zero to get the gas refund
        Tranche memory expiringTranche = tranches[_firstActiveTrancheId];
        delete tranches[_firstActiveTrancheId];

        // the tranche is expired now so we decrease the stake and the shares supply
        uint expiredStake = _activeStake * expiringTranche.stakeShares / _stakeSharesSupply;
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
      uint newAccNxmPerRewardsShare = elapsed * _rewardPerSecond / _rewardsSharesSupply;
      _accNxmPerRewardsShare = _accNxmPerRewardsShare.uncheckedAdd(newAccNxmPerRewardsShare);
      _lastAccNxmUpdate = block.timestamp;
    }

    firstActiveTrancheId = _firstActiveTrancheId;
    firstActiveBucketId = _firstActiveBucketId;

    activeStake = _activeStake;
    rewardPerSecond = _rewardPerSecond;
    accNxmPerRewardsShare = _accNxmPerRewardsShare;
    lastAccNxmUpdate = _lastAccNxmUpdate;
    stakeSharesSupply = _stakeSharesSupply;
    rewardsSharesSupply = _rewardsSharesSupply;
  }

  function depositTo(DepositRequest[] memory requests) public returns (uint[] memory tokenIds) {

    if (isPrivatePool) {
      require(
        msg.sender == coverContract || msg.sender == manager(),
        "StakingPool: The pool is private"
      );
    }

    updateTranches(true);

    // storage reads
    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint maxTranche = _firstActiveTrancheId + MAX_ACTIVE_TRANCHES - 1;

    uint totalAmount;
    tokenIds = new uint[](requests.length);

    for (uint i = 0; i < requests.length; i++) {

      DepositRequest memory request = requests[i];

      {
        require(request.amount > 0, "StakingPool: Insufficient deposit amount");
        require(request.trancheId <= maxTranche, "StakingPool: Requested tranche is not yet active");
        require(request.trancheId >= _firstActiveTrancheId, "StakingPool: Requested tranche has expired");
      }

      // deposit to token id = 0 is not allowed
      // we treat it as a flag to create a new token
      if (request.tokenId == 0) {
        tokenIds[i] = totalSupply++;
        address to = request.destination == address(0) ? msg.sender : request.destination;
        _mint(to, tokenIds[i]);
      } else {
        require(ownerOf(request.tokenId) != address(0), "StakingPool: Token does not exist");
        tokenIds[i] = request.tokenId;
      }

      uint newStakeShares = _stakeSharesSupply == 0
        ? Math.sqrt(request.amount)
        : _stakeSharesSupply * request.amount / _activeStake;

      uint newRewardsShares;

      // update deposit and pending reward
      {
        // conditional read
        Deposit memory deposit = request.tokenId == 0
          ? Deposit(0, 0, 0, 0)
          : deposits[tokenIds[i]][request.trancheId];

        newRewardsShares = calculateNewRewardShares(
          deposit.stakeShares, // initialStakeShares
          newStakeShares,      // newStakeShares
          request.trancheId,   // initialTrancheId
          request.trancheId,   // newTrancheId, the same as initialTrancheId in this case
          block.timestamp
        );

        // if we're increasing an existing deposit
        if (deposit.lastAccNxmPerRewardShare != 0) {
          uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(deposit.lastAccNxmPerRewardShare);
          deposit.pendingRewards += newEarningsPerShare * deposit.rewardsShares;
        }

        deposit.stakeShares += newStakeShares;
        deposit.rewardsShares += newRewardsShares;
        deposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;

        // sstore
        deposits[tokenIds[i]][request.trancheId] = deposit;
      }

      // update pool manager's reward shares
      {
        Deposit memory feeDeposit = deposits[0][request.trancheId];

        {
          // create fee deposit reward shares
          uint newFeeRewardShares = newRewardsShares * poolFee / POOL_FEE_DENOMINATOR;
          newRewardsShares += newFeeRewardShares;

          // calculate rewards until now
          uint newRewardPerShare = _accNxmPerRewardsShare.uncheckedSub(feeDeposit.lastAccNxmPerRewardShare);
          feeDeposit.pendingRewards += newRewardPerShare * feeDeposit.rewardsShares;
          feeDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;
          feeDeposit.rewardsShares += newFeeRewardShares;
        }

        deposits[0][request.trancheId] = feeDeposit;
      }

      // update tranche
      {
        Tranche memory tranche = tranches[request.trancheId];
        tranche.stakeShares += newStakeShares;
        tranche.rewardsShares += newRewardsShares;
        tranches[request.trancheId] = tranche;
      }

      totalAmount += request.amount;
      _activeStake += request.amount;
      _stakeSharesSupply += newStakeShares;
      _rewardsSharesSupply += newRewardsShares;
    }

    // transfer nxm from the staker and update the pool deposit balance
    tokenController.depositStakedNXM(msg.sender, totalAmount, poolId);

    // update globals
    activeStake = _activeStake;
    stakeSharesSupply = _stakeSharesSupply;
    rewardsSharesSupply = _rewardsSharesSupply;
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
    WithdrawRequest[] memory params
  ) public returns (uint totalWithdrawnStake, uint totalWithdrawnRewards) {

    uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager());

    // pass false as it does not modify the share supply nor the reward per second
    updateTranches(false);

    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;

    for (uint i = 0; i < params.length; i++) {

      uint tokenId = params[i].tokenId;
      uint trancheCount = params[i].trancheIds.length;
      uint stakeToWithdraw;
      uint rewardsToWithdraw;

      for (uint j = 0; j < trancheCount; j++) {

        uint trancheId = params[i].trancheIds[j];

        Deposit memory deposit = deposits[tokenId][trancheId];

        // can withdraw stake only if the tranche is expired
        if (params[i].withdrawStake && trancheId < _firstActiveTrancheId) {

          // Deposit withdrawals are not permitted while the manager is locked in governance to
          // prevent double voting.
          require(
            managerLockedInGovernanceUntil < block.timestamp,
            "StakingPool: While the pool manager is locked for governance voting only rewards can be withdrawn"
          );

          // calculate the amount of nxm for this deposit
          uint stake = expiredTranches[trancheId].stakeAmountAtExpiry;
          uint stakeShareSupply = expiredTranches[trancheId].stakeShareSupplyAtExpiry;
          stakeToWithdraw += stake * deposit.stakeShares / stakeShareSupply;

          // mark as withdrawn
          deposit.stakeShares = 0;
        }

        if (params[i].withdrawRewards) {

          // if the tranche is expired, use the accumulator value saved at expiration time
          uint accNxmPerRewardShareToUse = trancheId < _firstActiveTrancheId
            ? expiredTranches[trancheId].accNxmPerRewardShareAtExpiry
            : _accNxmPerRewardsShare;

          // calculate reward since checkpoint
          uint newRewardPerShare = accNxmPerRewardShareToUse.uncheckedSub(deposit.lastAccNxmPerRewardShare);
          rewardsToWithdraw += newRewardPerShare * deposit.rewardsShares + deposit.pendingRewards;

          // save checkpoint
          deposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;
          deposit.pendingRewards = 0;
          deposit.rewardsShares = 0;
        }

        deposits[tokenId][trancheId] = deposit;
      }

      tokenController.withdrawNXMStakeAndRewards(
        ownerOf(tokenId),
        stakeToWithdraw,
        rewardsToWithdraw,
        poolId
      );

      totalWithdrawnStake += stakeToWithdraw;
      totalWithdrawnRewards += rewardsToWithdraw;
    }
  }

  function allocateStake(
    CoverRequest calldata request
  ) external onlyCoverContract returns (
    uint allocatedCoverAmount,
    uint premium,
    uint rewardsInNXM
  ) {

    // passing true because we change the reward per second
    updateTranches(true);

    uint firstTrancheIdToUse = (block.timestamp + request.period + request.gracePeriod) / TRANCHE_DURATION;
    uint trancheCount = block.timestamp / TRANCHE_DURATION + MAX_ACTIVE_TRANCHES - firstTrancheIdToUse;
    uint remainingAmount = Math.divCeil(request.amount, NXM_PER_ALLOCATION_UNIT);

    (
      uint[] memory trancheAllocations,
      uint[] memory trancheCapacities,
      uint requestedTranchesCapacityUsed,
      uint requestedTranchesCapacity
    ) = getTrancheAllocationsAndCapacities(
      request.productId,
      firstTrancheIdToUse,
      trancheCount,
      request.globalCapacityRatio,
      request.capacityReductionRatio,
      remainingAmount
    );

    {
      uint[] memory coverTrancheAllocation = new uint[](trancheCount);

      for (uint i = 0; i < trancheCount; i++) {

        if (trancheAllocations[i] >= trancheCapacities[i]) {
          continue;
        }

        uint allocate = Math.min(trancheCapacities[i] - trancheAllocations[i], remainingAmount);

        remainingAmount -= allocate;
        allocatedCoverAmount += allocate;
        trancheAllocations[i] += allocate;
        coverTrancheAllocation[i] = allocate;

        if (remainingAmount == 0) {
          break;
        }
      }

      // technically should never happen because of the initial capacity check
      require(remainingAmount == 0, "StakingPool: Insufficient capacity");

      updateAllocations(
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        trancheAllocations
      );

      uint targetBucketId = Math.divCeil(
        block.timestamp + request.period + request.gracePeriod,
        BUCKET_DURATION
      );

      updateExpiringCoverAmounts(
        request.coverId,
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        targetBucketId,
        coverTrancheAllocation,
        true // isAllocation
      );
    }

    // the returned premium value has 18 decimals
    premium = getPremium(
      request.productId,
      request.period,
      allocatedCoverAmount,
      requestedTranchesCapacityUsed,
      requestedTranchesCapacity
    );

    {
      require(request.rewardRatio <= REWARDS_DENOMINATOR, "StakingPool: reward ratio exceeds denominator");

      uint rewards = premium * request.rewardRatio / REWARDS_DENOMINATOR;
      uint expireAtBucket = Math.divCeil(block.timestamp + request.period, BUCKET_DURATION);
      uint _rewardPerSecond = rewards / (expireAtBucket * BUCKET_DURATION - block.timestamp);

      // 1 SLOAD + 1 SSTORE
      rewardBuckets[expireAtBucket].rewardPerSecondCut += _rewardPerSecond;

      // scale back from 2 to 18 decimals
      allocatedCoverAmount *= NXM_PER_ALLOCATION_UNIT;

      // premium and rewards already have 18 decimals
      return (allocatedCoverAmount, premium, rewards);
    }
  }

  function deallocateStake(
    // TODO: use a DeallocationRequest instead as we don't need all the fields
    CoverRequest memory request,
    uint coverStartTime,
    uint premium
  ) external onlyCoverContract {
    updateTranches(true);
    deallocateStakeForCover(request, coverStartTime);
    removeCoverReward(coverStartTime, request.period, premium, request.rewardRatio);
  }

  function removeCoverReward(
    uint coverStartTime,
    uint period,
    uint premium,
    uint rewardRatio
  ) internal {

    require(rewardRatio <= REWARDS_DENOMINATOR, "StakingPool: reward ratio exceeds denominator");

    uint rewards = premium * rewardRatio / REWARDS_DENOMINATOR;
    uint expireAtBucket = Math.divCeil(coverStartTime + period, BUCKET_DURATION);
    uint _rewardPerSecond = rewards / (expireAtBucket * BUCKET_DURATION - coverStartTime);

    // 1 SLOAD + 1 SSTORE
    rewardBuckets[expireAtBucket].rewardPerSecondCut -= _rewardPerSecond;
  }

  function deallocateStakeForCover(
    CoverRequest memory request,
    uint coverStartTime
  ) internal {

    uint gracePeriodExpiration = coverStartTime + request.period + request.gracePeriod;
    uint firstTrancheIdToUse = gracePeriodExpiration / TRANCHE_DURATION;
    uint trancheCount = coverStartTime / TRANCHE_DURATION + MAX_ACTIVE_TRANCHES - firstTrancheIdToUse;

    (
      uint[] memory trancheAllocations,
      /*uint requestedTranchesCapacityUsed*/,
      /*uint totalCapacityUsed*/
    ) = getAllocations(
      request.productId,
      firstTrancheIdToUse,
      trancheCount
    );

    uint packedCoverTrancheAllocation = coverTrancheAllocations[request.coverId];

    {
      uint[] memory coverTrancheAllocation = new uint[](trancheCount);

      for (uint i = 0; i < trancheCount; i++) {
        uint amountPerTranche = uint32(packedCoverTrancheAllocation >> (i * 32));
        trancheAllocations[i] -= amountPerTranche;
        coverTrancheAllocation[i] = amountPerTranche;
      }

      updateAllocations(
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        trancheAllocations
      );

      updateExpiringCoverAmounts(
        request.coverId,
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        Math.divCeil(gracePeriodExpiration, BUCKET_DURATION),
        coverTrancheAllocation,
        false // isAllocation
      );
    }
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
      allocationGroups[i] = activeAllocations[productId][firstGroupId + i];
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
  ) internal view returns (uint32[] memory expiringCoverAmounts) {

    expiringCoverAmounts = new uint32[](MAX_ACTIVE_TRANCHES);

    uint firstGroupId = firstTrancheId / BUCKET_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + MAX_ACTIVE_TRANCHES - 1) / BUCKET_TRANCHE_GROUP_SIZE;

    // min 2, max 2
    uint groupCount = lastGroupId - firstGroupId + 1;
    BucketTrancheGroup[] memory bucketTrancheGroups = new BucketTrancheGroup[](groupCount);

    // min 1 and max 3 reads
    for (uint i = 0; i < groupCount; i++) {
      bucketTrancheGroups[i] = expiringCoverBuckets[productId][bucketId][firstGroupId + i];
    }

    // flatten bucket tranche groups
    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
      uint trancheId = firstTrancheId + i;
      uint trancheGroupIndex = trancheId / BUCKET_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % BUCKET_TRANCHE_GROUP_SIZE;
      uint32 expiringCoverAmount = bucketTrancheGroups[trancheGroupIndex].getItemAt(trancheIndexInGroup);
      expiringCoverAmounts[i] = expiringCoverAmount;
    }

    return expiringCoverAmounts;
  }

  function getAllocations(
    uint productId,
    uint firstTrancheIdToUse,
    uint trancheCount
  ) internal view returns (
    uint[] memory trancheAllocations,
    uint requestedTranchesCapacityUsed,
    uint totalCapacityUsed
  ) {

    trancheAllocations = new uint[](trancheCount);

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint currentBucket = (block.timestamp / BUCKET_DURATION).toUint16();

    (
      uint[] memory storedAllocations,
      uint lastBucketId
    ) = getStoredAllocations(productId, _firstActiveTrancheId);

    if (lastBucketId == 0) {
      lastBucketId = currentBucket;
    }

    while (lastBucketId < currentBucket) {

      ++lastBucketId;

      uint32[] memory coverExpirations = getExpiringCoverAmounts(
        productId,
        lastBucketId,
        firstTrancheIdToUse
      );

      for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
        storedAllocations[i] -= coverExpirations[i];
      }
    }

    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {

      uint trancheId = _firstActiveTrancheId + i;
      uint activeCoverAmount = storedAllocations[i];

      if (trancheId >= firstTrancheIdToUse) {
        trancheAllocations[trancheId - firstTrancheIdToUse] = activeCoverAmount;
        requestedTranchesCapacityUsed += activeCoverAmount;
      }

      totalCapacityUsed += activeCoverAmount;
    }

    return (trancheAllocations, requestedTranchesCapacityUsed, totalCapacityUsed);
  }

  function getActiveTrancheCapacities(
    uint productId,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) public view returns (
    uint[] memory trancheCapacities,
    uint totalCapacity
  ) {

    uint firstTrancheIdToUse = block.timestamp / TRANCHE_DURATION;

    (trancheCapacities, /* requestedTranchesCapacity */, totalCapacity) = getTrancheCapacities(
      productId,
      firstTrancheIdToUse,
      MAX_ACTIVE_TRANCHES,
      globalCapacityRatio,
      capacityReductionRatio
    );

    return (trancheCapacities, totalCapacity);
  }

  function getTrancheCapacities(
    uint productId,
    uint firstTrancheId,
    uint trancheCount,
    uint capacityRatio,
    uint reductionRatio
  ) internal view returns (
    uint[] memory trancheCapacities,
    uint requestedTranchesCapacity,
    uint totalCapacity
  ) {

    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    trancheCapacities = new uint[](trancheCount);

    if (_stakeSharesSupply == 0) {
      return (trancheCapacities, 0, 0);
    }

    uint multiplier =
      capacityRatio
      * (CAPACITY_REDUCTION_DENOMINATOR - reductionRatio)
      * products[productId].targetWeight;

    uint denominator =
      GLOBAL_CAPACITY_DENOMINATOR
      * CAPACITY_REDUCTION_DENOMINATOR
      * WEIGHT_DENOMINATOR;

    uint lastTrancheId = (block.timestamp / TRANCHE_DURATION) + MAX_ACTIVE_TRANCHES - 1;

    for (
      uint trancheId = block.timestamp / TRANCHE_DURATION;
      trancheId <= lastTrancheId;
      trancheId++
    ) {

      uint trancheCapacity =
        (_activeStake * tranches[trancheId].stakeShares / _stakeSharesSupply) // tranche stake
        * multiplier
        / denominator
        / NXM_PER_ALLOCATION_UNIT;

      if (trancheId >= firstTrancheId) {
        trancheCapacities[trancheId - firstTrancheId] = trancheCapacity;
        requestedTranchesCapacity += trancheCapacity;
      }

      totalCapacity += trancheCapacity;
    }

    return (trancheCapacities, requestedTranchesCapacity, totalCapacity);
  }

  function getTrancheAllocationsAndCapacities(
    uint productId,
    uint firstTrancheIdToUse,
    uint trancheCount,
    uint globalCapacityRatio,
    uint capacityReductionRatio,
    uint requiredCapacity
  ) internal view returns (
    uint[] memory trancheAllocations,
    uint[] memory trancheCapacities,
    uint requestedTranchesCapacityUsed,
    uint requestedTranchesCapacity
  ) {

    uint totalInitialCapacityUsed;
    uint totalCapacity;

    (
      trancheAllocations,
      requestedTranchesCapacityUsed,
      totalInitialCapacityUsed
    ) = getAllocations(
      productId,
      firstTrancheIdToUse,
      trancheCount
    );

    (
      trancheCapacities,
      requestedTranchesCapacity,
      totalCapacity
    ) = getTrancheCapacities(
      productId,
      firstTrancheIdToUse,
      trancheCount,
      globalCapacityRatio,
      capacityReductionRatio
    );

    require(
      // capacity check
      requestedTranchesCapacityUsed + requiredCapacity <= requestedTranchesCapacity
      // weight check
      && totalInitialCapacityUsed + requiredCapacity <= totalCapacity,
      "StakingPool: Insufficient capacity"
    );
  }

  function updateAllocations(
    uint productId,
    uint firstTrancheId,
    uint trancheCount,
    uint[] memory allocations
  ) internal {

    uint firstGroupId = firstTrancheId / COVER_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + trancheCount - 1) / COVER_TRANCHE_GROUP_SIZE;
    uint16 currentBucket = (block.timestamp / BUCKET_DURATION).toUint16();

    uint groupCount = lastGroupId - firstGroupId + 1;
    TrancheAllocationGroup[] memory allocationGroups = new TrancheAllocationGroup[](groupCount);

    // min 1 and max 3 reads
    for (uint i = 0; i < groupCount; i++) {
      allocationGroups[i] = activeAllocations[productId][firstGroupId + i];
    }

    for (uint i = 0; i < trancheCount; i++) {

      uint trancheId = firstTrancheId + i;
      uint trancheGroupId = trancheId / COVER_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % COVER_TRANCHE_GROUP_SIZE;

      // setItemAt does not mutate so we have to reassign it
      allocationGroups[trancheGroupId] = allocationGroups[trancheGroupId].setItemAt(
        trancheIndexInGroup,
        allocations[i].toUint48()
      );
    }

    for (uint i = 0; i < groupCount; i++) {
      activeAllocations[productId][firstGroupId + i] = allocationGroups[i].setLastBucketId(currentBucket);
    }
  }

  function updateExpiringCoverAmounts(
    uint coverId,
    uint productId,
    uint firstTrancheId,
    uint trancheCount,
    uint targetBucketId,
    uint[] memory coverTrancheAllocation,
    bool isAllocation
  ) internal {

    uint firstGroupId = firstTrancheId / BUCKET_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + trancheCount - 1) / BUCKET_TRANCHE_GROUP_SIZE;

    // min 1 and max 2 reads
    uint groupCount = lastGroupId - firstGroupId + 1;
    BucketTrancheGroup[] memory bucketTrancheGroups = new BucketTrancheGroup[](groupCount);

    for (uint i = 0; i < groupCount; i++) {
      bucketTrancheGroups[i] = expiringCoverBuckets[productId][targetBucketId][firstGroupId + i];
    }

    uint packedCoverTrancheAllocation;

    for (uint i = 0; i < trancheCount; i++) {

      uint trancheId = firstTrancheId + i;
      uint trancheGroupId = trancheId / BUCKET_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % BUCKET_TRANCHE_GROUP_SIZE;

      uint32 expiringAmount = bucketTrancheGroups[trancheGroupId].getItemAt(trancheIndexInGroup);
      uint32 trancheAllocation = coverTrancheAllocation[i].toUint32();

      if (isAllocation) {
        expiringAmount += trancheAllocation;
        packedCoverTrancheAllocation |= uint(trancheAllocation) << (i * 32);
      } else {
        expiringAmount -= trancheAllocation;
      }

      // setItemAt does not mutate so we have to reassign it
      bucketTrancheGroups[trancheGroupId] = bucketTrancheGroups[trancheGroupId].setItemAt(
        trancheIndexInGroup,
        expiringAmount
      );
    }

    if (isAllocation) {
      coverTrancheAllocations[coverId] = packedCoverTrancheAllocation;
    } else {
      delete coverTrancheAllocations[coverId];
    }

    for (uint i = 0; i < groupCount; i++) {
      expiringCoverBuckets[productId][targetBucketId][firstGroupId + i] = bucketTrancheGroups[i];
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
  ) external {

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;

    {
      // token id 0 is only used for pool manager fee tracking, no deposits allowed
      require(tokenId != 0, "StakingPool: Invalid token id");
      require(initialTrancheId < newTrancheId, "StakingPool: The chosen tranche cannot end before the initial one");

      uint maxTrancheId = _firstActiveTrancheId + MAX_ACTIVE_TRANCHES - 1;
      require(newTrancheId <= maxTrancheId, "StakingPool: The tranche is not yet available");
      require(newTrancheId >= _firstActiveTrancheId, "StakingPool: The tranche has already expired");
    }

    // if the initial tranche is expired, withdraw everything and make a new deposit
    // this requires the user to have grante sufficient allowance
    if (initialTrancheId < _firstActiveTrancheId) {

      uint[] memory trancheIds = new uint[](1);
      trancheIds[0] = initialTrancheId;

      WithdrawRequest[] memory withdrawRequests = new WithdrawRequest[](1);
      withdrawRequests[0] = WithdrawRequest(
        tokenId,
        true, // withdraw the deposit
        true, // withdraw the rewards
        trancheIds
      );

      (uint withdrawnStake, /* uint rewardsToWithdraw */) = withdraw(withdrawRequests);

      DepositRequest[] memory depositRequests = new DepositRequest[](1);
      depositRequests[0] = (
        DepositRequest(
          withdrawnStake + topUpAmount, // amount
          newTrancheId,                 // trancheId
          tokenId,                      // tokenId
          msg.sender                    // destination
        )
      );

      depositTo(depositRequests);

      return;
      // done! skip the rest of the function.
    }

    // if we got here - the initial tranche is still active. move all the shares to the new tranche

    // passing true because we mint reward shares
    updateTranches(true);

    Deposit memory initialDeposit = deposits[tokenId][initialTrancheId];
    Deposit memory updatedDeposit = deposits[tokenId][newTrancheId];

    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint transferAmount = topUpAmount;
    uint newStakeShares;

    if (updatedDeposit.stakeShares != 0) {
      transferAmount += _activeStake * initialDeposit.stakeShares / _stakeSharesSupply;
    }

    // calculate the new stake shares if there's a deposit top up
    if (topUpAmount > 0) {
      newStakeShares = _stakeSharesSupply * topUpAmount / _activeStake;
      activeStake = _activeStake + topUpAmount;
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
      newTranche.stakeShares += initialDeposit.stakeShares + newStakeShares;
      newTranche.rewardsShares += initialDeposit.rewardsShares + newRewardsShares;

      // store the updated tranches
      tranches[initialTrancheId] = initialTranche;
      tranches[newTrancheId] = newTranche;
    }

    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    // if there already is a deposit on the new tranche, calculate its pending rewards
    if (updatedDeposit.lastAccNxmPerRewardShare != 0) {
      uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(updatedDeposit.lastAccNxmPerRewardShare);
      updatedDeposit.pendingRewards += newEarningsPerShare * updatedDeposit.rewardsShares;
    }

    // calculate the rewards for the deposit being extended and move them to the new deposit
    {
      uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(initialDeposit.lastAccNxmPerRewardShare);
      updatedDeposit.pendingRewards += newEarningsPerShare * initialDeposit.rewardsShares;
      updatedDeposit.pendingRewards += initialDeposit.pendingRewards;
    }

    updatedDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;
    updatedDeposit.stakeShares += initialDeposit.stakeShares + newStakeShares;
    updatedDeposit.rewardsShares += initialDeposit.rewardsShares + newRewardsShares;

    // everything is moved, delete the initial deposit
    delete deposits[tokenId][initialTrancheId];

    // store the new deposit.
    deposits[tokenId][newTrancheId] = updatedDeposit;

    // update global shares supply
    stakeSharesSupply = _stakeSharesSupply + newStakeShares;
    rewardsSharesSupply += newRewardsShares;

    // transfer nxm from the staker and update the pool deposit balance
    tokenController.depositStakedNXM(msg.sender, transferAmount, poolId);
  }

  // O(1)
  function burnStake(
    uint productId,
    uint start,
    uint period,
    uint amount
  ) external onlyCoverContract {

    productId;
    start;
    period;

    // TODO: free up the stake used by the corresponding cover
    // TODO: block the pool if we perform 100% of the stake

    // passing false because neither the amount of shares nor the reward per second are changed
    updateTranches(false);

    uint _activeStake = activeStake;
    activeStake = _activeStake > amount ? _activeStake - amount : 0;
  }

  /* nft */

  function transferFrom(
    address from,
    address to,
    uint256 tokenId
  ) public override {

    if (tokenId == 0) {
      require(
        nxm.isLockedForMV(from) < block.timestamp,
        "StakingPool: Active pool assets are locked for voting in governance"
      );
    }

    super.transferFrom(from, to, tokenId);
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

  function manager() public view returns (address) {
    return ownerOf(0);
  }

  /* pool management */

  function recalculateEffectiveWeights(uint[] calldata productIds) external {
    (
    uint globalCapacityRatio,
    uint globalMinPriceRatio,
    uint[] memory initialPriceRatios,
    uint[] memory capacityReductionRatios
    ) = ICover(coverContract).getPriceAndCapacityRatios(productIds);

    uint _totalEffectiveWeight = totalEffectiveWeight;

    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];
      StakedProduct memory _product = products[productId];

      uint8 previousEffectiveWeight = _product.lastEffectiveWeight;
      _product.lastEffectiveWeight = _getEffectiveWeight(
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

      if (_product.nextPriceUpdateTime == 0) {
        _product.nextPrice = initialPriceRatios[i].toUint96();
        _product.nextPriceUpdateTime = uint32(block.timestamp);
        require(_param.setTargetPrice, "StakingPool: Must set price for new products");
      }

      if (_param.setTargetPrice) {
        require(_param.targetPrice <= TARGET_PRICE_DENOMINATOR, "StakingPool: Target price too high");
        require(_param.targetPrice >= globalMinPriceRatio, "StakingPool: Target price below GLOBAL_MIN_PRICE_RATIO");
        _product.targetPrice = _param.targetPrice;
      }

      require(
        !_param.setTargetWeight || _param.recalculateEffectiveWeight,
        "StakingPool: Must recalculate effectiveWeight to edit targetWeight"
      );

      // Must recalculate effectiveWeight to adjust targetWeight
      if (_param.recalculateEffectiveWeight) {

        if (_param.setTargetWeight) {
          require(_param.targetWeight <= WEIGHT_DENOMINATOR, "StakingPool: Cannot set weight beyond 1");

          // totalEffectiveWeight cannot be above the max unless target  weight is not increased
          if (!targetWeightIncreased) {
            targetWeightIncreased = _param.targetWeight > _product.targetWeight;
          }
          _totalTargetWeight = _totalTargetWeight - _product.targetWeight + _param.targetWeight;
          _product.targetWeight = _param.targetWeight;
        }

        uint8 previousEffectiveWeight = _product.lastEffectiveWeight;
        _product.lastEffectiveWeight = _getEffectiveWeight(
          _param.productId,
          _product.targetWeight,
          globalCapacityRatio,
          capacityReductionRatios[i]
        );
        _totalEffectiveWeight = _totalEffectiveWeight - previousEffectiveWeight + _product.lastEffectiveWeight;
      }
      products[_param.productId] = _product;
    }

    if (_totalEffectiveWeight > MAX_TOTAL_WEIGHT) {
      require(!targetWeightIncreased, "StakingPool: Total max effective weight exceeded");
    }
    totalTargetWeight = _totalTargetWeight.toUint32();
    totalEffectiveWeight = _totalEffectiveWeight.toUint32();
  }

  function _setInitialProducts(ProductInitializationParams[] memory params) internal {
    uint32 _totalTargetWeight = totalTargetWeight;

    for (uint i = 0; i < params.length; i++) {
      ProductInitializationParams memory param = params[i];
      StakedProduct storage _product = products[param.productId];
      require(param.targetPrice <= TARGET_PRICE_DENOMINATOR, "StakingPool: Target price too high");
      require(param.weight <= WEIGHT_DENOMINATOR, "StakingPool: Cannot set weight beyond 1");
      _product.nextPrice = param.initialPrice;
      _product.nextPriceUpdateTime = uint32(block.timestamp);
      _product.targetPrice = param.targetPrice;
      _product.targetWeight = param.weight;
      _totalTargetWeight += param.weight;
    }

    require(_totalTargetWeight <= MAX_TOTAL_WEIGHT, "StakingPool: Total max target weight exceeded");
    totalTargetWeight = _totalTargetWeight;
    totalEffectiveWeight = totalTargetWeight;
  }

  function setPoolFee(uint newFee) external onlyManager {

    require(newFee <= maxPoolFee, "StakingPool: new fee exceeds max fee");
    uint oldFee = poolFee;
    poolFee = uint8(newFee);

    // passing true because the amount of rewards shares changes
    updateTranches(true);

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
      feeDeposit.pendingRewards += newRewardPerRewardsShare * feeDeposit.rewardsShares;
      feeDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;
      // TODO: would using tranche.rewardsShares give a better precision?
      feeDeposit.rewardsShares = feeDeposit.rewardsShares * newFee / oldFee;

      // sstore
      deposits[0][trancheId] = feeDeposit;
    }
  }

  function setPoolPrivacy(bool _isPrivatePool) external onlyManager {
    isPrivatePool = _isPrivatePool;
  }

  /* utils */

  function getPriceParameters(
    uint productId,
    uint maxCoverPeriod
  ) external override view returns (
    uint activeCover,
    uint[] memory staked,
    uint lastBasePrice,
    uint targetPrice
  ) {

    // TODO: this is probably wrong, needs to be reimplemented
    uint maxTranches = maxCoverPeriod / TRANCHE_DURATION + 1;
    staked = new uint[](maxTranches);

    for (uint i = 0; i < maxTranches; i++) {
      staked[i] = getProductStake(productId, block.timestamp + i * TRANCHE_DURATION);
    }

    activeCover = getAllocatedProductStake(productId);
    lastBasePrice = products[productId].nextPrice;
    targetPrice = products[productId].targetPrice;
  }

  function getPremium(
    uint productId,
    uint period,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity
  ) internal returns (uint) {

    StakedProduct memory product = products[productId];

    uint basePrice;
    {
      // use previously recorded next price and apply time based smoothing towards target price
      uint timeSinceLastUpdate = block.timestamp - product.nextPriceUpdateTime;
      uint priceDrop = PRICE_CHANGE_PER_DAY * timeSinceLastUpdate / 1 days;

      // basePrice = max(targetPrice, nextPrice - priceDrop)
      // rewritten to avoid underflow
      basePrice = product.nextPrice < product.targetPrice + priceDrop
        ? product.targetPrice
        : product.nextPrice - priceDrop;
    }

    // calculate the next price by applying the price bump
    uint priceBump = PRICE_BUMP_RATIO * coverAmount / totalCapacity;
    product.nextPrice = (basePrice + priceBump).toUint96();
    product.nextPriceUpdateTime = uint32(block.timestamp);

    // sstore
    products[productId] = product;

    // use calculated base price and apply surge pricing if applicable
    uint premiumPerYear = calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity
    );

    // calculate the premium for the requested period
    return premiumPerYear * period / 365 days;
  }

  function calculatePremiumPerYear(
    uint basePrice,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity
  ) public pure returns (uint) {

    // base price has 18 decimals
    // cover amount has 2 decimals (100 = 1 unit)
    // dividing by ALLOCATION_UNITS_PER_NXM (=100) to get the right amount of decimals
    uint basePremium = basePrice * coverAmount / ALLOCATION_UNITS_PER_NXM;
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
  ) internal pure returns (uint) {

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

  function _getEffectiveWeight(
    uint productId,
    uint targetWeight,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) internal view returns (uint8 effectiveWeight) {
    uint firstTrancheIdToUse = block.timestamp / TRANCHE_DURATION;

    (, , uint totalAllocation) = getAllocations(
      productId,
      firstTrancheIdToUse,
      MAX_ACTIVE_TRANCHES
    );

    (, , uint totalCapacity) = getTrancheCapacities(
      productId,
      firstTrancheIdToUse,
      MAX_ACTIVE_TRANCHES,
      globalCapacityRatio,
      capacityReductionRatio
    );

    uint actualWeight = totalCapacity > 0 ? (totalAllocation * WEIGHT_DENOMINATOR / totalCapacity) : 0;
    effectiveWeight = (Math.max(targetWeight, actualWeight)).toUint8();
  }
}
