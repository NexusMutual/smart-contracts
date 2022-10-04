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
  using StakingTypesLib for CoverAmountGroup;
  using StakingTypesLib for CoverAmount;
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

  // TODO: this should be allowed to overflow (similar to uniswapv2 twap)
  // accumulated rewarded nxm per reward share
  uint public accNxmPerRewardsShare;

  // timestamp when accNxmPerRewardsShare was last updated
  uint public lastAccNxmUpdate;

  uint public firstActiveTrancheId;
  uint public firstActiveBucketId;

  bool public isPrivatePool;
  uint8 public poolFee;
  uint8 public maxPoolFee;
  uint32 public targetWeight;

  // erc721 supply
  uint public totalSupply;

  // tranche id => tranche data
  mapping(uint => Tranche) public tranches;

  // tranche id => expired tranche data
  mapping(uint => ExpiredTranche) public expiredTranches;

  // reward bucket id => RewardBucket
  mapping(uint => RewardBucket) public rewardBuckets;

  // product id => cover tranche group id => active cover amounts for a tranche group
  mapping(uint => mapping(uint => CoverAmountGroup)) public activeCoverAmounts;

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
  uint public constant COVER_TRANCHE_GROUP_SIZE = 4;
  uint public constant BUCKET_TRANCHE_GROUP_SIZE = 8;

  uint public constant REWARD_BONUS_PER_TRANCHE_RATIO = 10_00; // 10.00%
  uint public constant REWARD_BONUS_PER_TRANCHE_DENOMINATOR = 100_00;
  uint public constant PRODUCT_WEIGHT_DENOMINATOR = 100_00;
  uint public constant WEIGHT_DENOMINATOR = 100;
  uint public constant REWARDS_DENOMINATOR = 100_00;
  uint public constant FEE_DENOMINATOR = 100;

  // denominators for cover contract parameters
  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 100_00;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 100_00;
  uint public constant INITIAL_PRICE_DENOMINATOR = 100_00;

  // next price smoothing
  uint public constant PRICE_CHANGE_PER_DAY = 0.005 ether; // 0.5%

  uint public constant SURGE_THRESHOLD_RATIO = 90_00; // 80.00%
  uint public constant SURGE_THRESHOLD_DENOMINATOR = 100_00; // 100.00%

  // +2% for every 1%
  uint public constant SURGE_PRICE_RATIO = 200_00; // 200.00%
  uint public constant SURGE_PRICE_DENOMINATOR = 100_00; // 100.00%

  // base price bump by 0.002% for each 1% of capacity used, ie 2% for 100%
  uint public constant PRICE_BUMP_RATIO = 2_00; // 2.00%
  uint public constant PRICE_BUMP_DENOMINATOR = 100_00; // 100.00%

  // 1e18
  uint public constant TOKEN_PRECISION = 1 ether;

  uint public constant ALLOCATIONS_DENOMINATOR = 1e16;

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

    ProductParams[] memory productParams = _setInitialPrices(params);
    _setProducts(productParams);

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
        // TODO: make sure the token is already minted
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
          uint newFeeRewardShares = newRewardsShares * poolFee / FEE_DENOMINATOR;
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
  ) external onlyCoverContract returns (uint allocatedCoverAmount, uint premium, uint rewardsInNXM) {

    // passing true because we change the reward per second
    updateTranches(true);

    // process expirations
    uint gracePeriodExpiration = block.timestamp + request.period + request.gracePeriod;
    uint firstTrancheIdToUse = gracePeriodExpiration / TRANCHE_DURATION;

    // maxTrancheId = block.timestamp / TRANCHE_DURATION + MAX_ACTIVE_TRANCHES - 1
    // trancheCount = maxTrancheId - firstTrancheIdToUse + 1
    uint trancheCount = block.timestamp / TRANCHE_DURATION + MAX_ACTIVE_TRANCHES - firstTrancheIdToUse;

    (
      uint[] memory trancheAllocatedCapacities,
      uint totalAllocatedCapacity
    ) = getAllocatedCapacities(
      request.productId,
      firstTrancheIdToUse,
      trancheCount
    );

    (uint[] memory totalCapacities, uint totalCapacity) = getTotalCapacities(
      request.productId,
      firstTrancheIdToUse,
      trancheCount,
      request.globalCapacityRatio,
      request.capacityReductionRatio
    );

    // TODO: handle totalCapacity == 0 with a meaningful message

    {
      uint[] memory coverTrancheAllocation = new uint[](trancheCount);
      uint remainingAmount = request.amount;

      for (uint i = 0; i < trancheCount; i++) {

        if (trancheAllocatedCapacities[i] >= totalCapacities[i]) {
          continue;
        }

        uint availableTrancheCapacity = totalCapacities[i] - trancheAllocatedCapacities[i];
        uint allocate = Math.min(availableTrancheCapacity, remainingAmount);

        remainingAmount -= allocate;
        allocatedCoverAmount += allocate;
        trancheAllocatedCapacities[i] += allocate;
        coverTrancheAllocation[i] = allocate;

        if (remainingAmount == 0) {
          break;
        }
      }

      updateAllocatedCapacities(
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        trancheAllocatedCapacities
      );

      updateExpiringCoverAmounts(
        request.coverId,
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        gracePeriodExpiration / BUCKET_DURATION + 1,
        coverTrancheAllocation,
        true // isAllocation
      );
    }

    premium = getPremium(
      request.productId,
      allocatedCoverAmount,
      request.period,
      totalAllocatedCapacity,
      totalCapacity
    );

    uint rewards;
    {
      require(request.rewardRatio <= REWARDS_DENOMINATOR, "StakingPool: reward ratio exceeds denominator");

      rewards = premium * request.rewardRatio / REWARDS_DENOMINATOR;
      uint expireAtBucket = Math.divCeil(block.timestamp + request.period, BUCKET_DURATION);
      uint _rewardPerSecond = rewards / (expireAtBucket * BUCKET_DURATION - block.timestamp);

      // 1 SLOAD + 1 SSTORE
      rewardBuckets[expireAtBucket].rewardPerSecondCut += _rewardPerSecond;
    }

    return (allocatedCoverAmount, premium, rewards);
  }

  function deallocateStake(
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
      uint[] memory trancheAllocatedCapacities,
      /*uint totalAllocatedCapacity*/
    ) = getAllocatedCapacities(
      request.productId,
      firstTrancheIdToUse,
      trancheCount
    );

    uint packedCoverTrancheAllocation = coverTrancheAllocations[request.coverId];

    {
      uint[] memory coverTrancheAllocation = new uint[](trancheCount);

      for (uint i = 0; i < trancheCount; i++) {
        uint amountPerTranche = uint32(packedCoverTrancheAllocation >> (i * 32));
        trancheAllocatedCapacities[i] -= amountPerTranche;
        coverTrancheAllocation[i] = amountPerTranche;
      }

      updateAllocatedCapacities(
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        trancheAllocatedCapacities
      );

      updateExpiringCoverAmounts(
        request.coverId,
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        gracePeriodExpiration / BUCKET_DURATION + 1,
        coverTrancheAllocation,
        false // isAllocation
      );
    }
  }

  function getStoredActiveCoverAmounts(
    uint productId,
    uint firstTrancheId,
    uint trancheCount
  ) internal view returns (CoverAmount[] memory) {

    uint firstGroupId = firstTrancheId / COVER_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + trancheCount - 1) / COVER_TRANCHE_GROUP_SIZE;

    // min 1 and max 3 reads
    uint groupCount = lastGroupId - firstGroupId + 1;

    CoverAmountGroup[] memory coverAmountGroups = new CoverAmountGroup[](groupCount);
    CoverAmount[] memory coverAmounts = new CoverAmount[](trancheCount);

    for (uint i = 0; i < groupCount; i++) {
      coverAmountGroups[i] = activeCoverAmounts[productId][firstGroupId + i];
    }

    // flatten groups
    for (uint i = 0; i < trancheCount; i++) {
      uint trancheId = firstTrancheId + i;
      uint trancheGroupId = trancheId / COVER_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % COVER_TRANCHE_GROUP_SIZE;

      CoverAmount coverAmount = coverAmountGroups[trancheGroupId].getItemAt(trancheIndexInGroup);
      coverAmounts[i] = coverAmount;
    }

    return coverAmounts;
  }

  function getExpiringCoverAmounts(
    uint productId,
    uint bucketId,
    uint firstTrancheId,
    uint trancheCount
  ) internal view returns (uint32[] memory expiringCoverAmounts) {

    uint firstGroupId = firstTrancheId / BUCKET_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + trancheCount - 1) / BUCKET_TRANCHE_GROUP_SIZE;

    // min 1, max 2
    uint groupCount = lastGroupId - firstGroupId + 1;
    BucketTrancheGroup[] memory bucketTrancheGroups = new BucketTrancheGroup[](groupCount);
    expiringCoverAmounts = new uint32[](trancheCount);

    // min 1 and max 3 reads
    for (uint i = 0; i < groupCount; i++) {
      bucketTrancheGroups[i] = expiringCoverBuckets[productId][bucketId][firstGroupId + i];
    }

    // flatten groups
    for (uint i = 0; i < trancheCount; i++) {
      uint trancheId = firstTrancheId + i;
      uint trancheGroupId = trancheId / BUCKET_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % BUCKET_TRANCHE_GROUP_SIZE;
      uint32 expiringCoverAmount = bucketTrancheGroups[trancheGroupId].getItemAt(trancheIndexInGroup);
      expiringCoverAmounts[i] = expiringCoverAmount;
    }

    return expiringCoverAmounts;
  }

  function getAllocatedCapacities(
    uint productId,
    uint firstTrancheIdToUse,
    uint trancheCount
  ) internal view returns (uint[] memory allocatedCapacities, uint allocatedCapacity) {

    allocatedCapacities = new uint[](trancheCount);

    CoverAmount[] memory coverAmounts = getStoredActiveCoverAmounts(
      productId,
      firstTrancheIdToUse,
      trancheCount
    );

    uint16 currentBucket = (block.timestamp / BUCKET_DURATION).toUint16();
    uint16 lastBucketId;

    for (uint i = 0; i < trancheCount; i++) {
      lastBucketId = coverAmounts[i].lastBucketId();
      if (lastBucketId != 0) {
        break;
      }
    }

    if (lastBucketId == 0) {
      lastBucketId = currentBucket;
    }

    while (lastBucketId < currentBucket) {

      ++lastBucketId;

      uint32[] memory coverExpirations = getExpiringCoverAmounts(
        productId,
        lastBucketId,
        firstTrancheIdToUse,
        trancheCount
      );

      for (uint i = 0; i < trancheCount; i++) {

        uint16 storedLastBucketId = coverAmounts[i].lastBucketId();
        if (storedLastBucketId == 0 || storedLastBucketId >= lastBucketId) {
          continue;
        }

        coverAmounts[i] = StakingTypesLib.newCoverAmount(
          coverAmounts[i].activeCoverAmount() - coverExpirations[i],
          lastBucketId
        );
      }
    }

    for (uint i = 0; i < trancheCount; i++) {
      uint activeCoverAmount = coverAmounts[i].activeCoverAmount();
      allocatedCapacities[i] = activeCoverAmount;
      allocatedCapacity += activeCoverAmount;
    }

    return (allocatedCapacities, allocatedCapacity);
  }

  function getTotalCapacities(
    uint productId,
    uint firstTrancheId,
    uint trancheCount,
    uint capacityRatio,
    uint reductionRatio
  ) internal view returns (uint[] memory totalCapacities, uint totalCapacity) {

    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;

    if (_stakeSharesSupply == 0) {
      totalCapacities = new uint[](trancheCount);
      totalCapacity = 0;
      return (totalCapacities, totalCapacity);
    }

    uint weight = products[productId].targetWeight;

    totalCapacities = new uint[](trancheCount);
    totalCapacity = 0;

    uint multiplier = capacityRatio * (CAPACITY_REDUCTION_DENOMINATOR - reductionRatio) * weight;

    uint denominator = GLOBAL_CAPACITY_DENOMINATOR * CAPACITY_REDUCTION_DENOMINATOR * WEIGHT_DENOMINATOR;

    for (uint i = 0; i < trancheCount; i++) {
      // SLOAD
      uint trancheStakeShares = tranches[firstTrancheId + i].stakeShares;
      uint trancheStake = _activeStake * trancheStakeShares / _stakeSharesSupply;
      uint totalTrancheCapacity = trancheStake * multiplier / denominator;
      totalCapacities[i] = totalTrancheCapacity;
      totalCapacity += totalTrancheCapacity;
    }

    return (totalCapacities, totalCapacity);
  }

  function updateAllocatedCapacities(
    uint productId,
    uint firstTrancheId,
    uint trancheCount,
    uint[] memory allocatedCapacities
  ) internal {

    uint firstGroupId = firstTrancheId / COVER_TRANCHE_GROUP_SIZE;
    uint lastGroupId = (firstTrancheId + trancheCount - 1) / COVER_TRANCHE_GROUP_SIZE;
    uint16 currentBucket = (block.timestamp / BUCKET_DURATION).toUint16();

    // min 1 and max 3 reads
    uint groupCount = lastGroupId - firstGroupId + 1;
    CoverAmountGroup[] memory coverAmountGroups = new CoverAmountGroup[](groupCount);

    for (uint i = 0; i < groupCount; i++) {
      coverAmountGroups[i] = activeCoverAmounts[productId][firstGroupId + i];
    }

    for (uint i = 0; i < trancheCount; i++) {

      uint trancheId = firstTrancheId + i;
      uint trancheGroupId = trancheId / COVER_TRANCHE_GROUP_SIZE - firstGroupId;
      uint trancheIndexInGroup = trancheId % COVER_TRANCHE_GROUP_SIZE;

      // setItemAt does not mutate so we have to reassign it
      coverAmountGroups[trancheGroupId] = coverAmountGroups[trancheGroupId].setItemAt(
        trancheIndexInGroup,
        StakingTypesLib.newCoverAmount((allocatedCapacities[i] / ALLOCATIONS_DENOMINATOR).toUint48(), currentBucket)
      );
    }

    for (uint i = 0; i < groupCount; i++) {
      activeCoverAmounts[productId][firstGroupId + i] = coverAmountGroups[i];
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
      uint32 trancheAllocation = (coverTrancheAllocation[i] / ALLOCATIONS_DENOMINATOR).toUint32();

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

  function setProducts(ProductParams[] memory params) external onlyManager {
    _setProducts(params);
  }

  function _setProducts(ProductParams[] memory params) internal {
    uint32 _targetWeight = targetWeight;
    for (uint i = 0; i < params.length; i++) {
      ProductParams memory _param = params[i];
      StakedProduct memory _product = products[_param.productId];
      if (_product.nextPriceUpdateTime == 0) {
        Product memory coverProduct = ICover(coverContract).products(_param.productId);
        require(coverProduct.initialPriceRatio > 0, "Failed to get initial price for product");
        _product.nextPrice = coverProduct.initialPriceRatio;
        _product.nextPriceUpdateTime = uint32(block.timestamp);
      }

      if (_param.setPrice) {
        require(_param.targetPrice <= SURGE_PRICE_DENOMINATOR, "Target price too high");
        _product.targetPrice = _param.targetPrice;
      }

      if (_param.setWeight) {
          require(_param.targetWeight <= WEIGHT_DENOMINATOR, "Cannot set weight beyond 1");

          if (_product.targetWeight < _param.targetWeight) {
             _targetWeight += _param.targetWeight - _product.targetWeight;
          } else {
            _targetWeight -= _product.targetWeight - _param.targetWeight;
          }
          _product.targetWeight = _param.targetWeight;
      }
      products[_param.productId] = _product;
    // End for loop
    }
    require(_targetWeight <= 2000, "Target weight above 20");
    targetWeight = _targetWeight;
  }

  function _setInitialPrices(ProductInitializationParams[] memory params) internal returns (ProductParams[] memory res) {
    res = new ProductParams[](params.length);
    for (uint i = 0; i < params.length; i++) {
      StakedProduct storage _product = products[params[i].productId];
      _product.nextPrice = params[i].initialPrice;
      _product.nextPriceUpdateTime = uint32(block.timestamp);
      res[i] = ProductParams(params[i].productId, true, params[i].weight, true, params[i].targetPrice);
    }
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
    uint coverAmount,
    uint period,
    uint allocatedCapacity,
    uint totalCapacity
  ) internal returns (uint) {

    StakedProduct memory product = products[productId];

    // use previously recorded next price and apply time based smoothing towards target price
    uint basePrice = calculateBasePrice(
      product.targetPrice,
      product.nextPrice,
      product.nextPriceUpdateTime,
      block.timestamp
    );

    // calculate the next price by applying the price bump
    uint priceBump = coverAmount * PRICE_BUMP_RATIO / totalCapacity / PRICE_BUMP_DENOMINATOR;
    product.nextPrice = (basePrice + priceBump).toUint96();
    product.nextPriceUpdateTime = uint32(block.timestamp);

    // sstore
    products[productId] = product;

    // use calculated base price and apply surge pricing if applicable
    uint premiumPerYear = calculatePremiumPerYear(
      basePrice,
      coverAmount,
      allocatedCapacity,
      totalCapacity
    );

    // calculate the premium for the requested period
    return premiumPerYear * period / 365 days;
  }

  function calculateBasePrice(
    uint targetPrice,
    uint nextPrice,
    uint nextPriceUpdateTime,
    uint currentTime
  ) public pure returns (uint) {

    uint timeSinceLastUpdate = currentTime - nextPriceUpdateTime;
    uint priceDrop = PRICE_CHANGE_PER_DAY * timeSinceLastUpdate / 1 days;

    // basePrice = max(targetPrice, nextPrice - priceDrop)
    // rewritten to avoid underflow

    if (nextPrice < targetPrice + priceDrop) {
      return targetPrice;
    }

    return nextPrice - priceDrop;
  }

  function calculatePremiumPerYear(
    uint basePrice,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity
  ) public pure returns (uint) {

    uint basePremium = coverAmount * basePrice / TOKEN_PRECISION;
    uint surgeStartPoint = totalCapacity * SURGE_THRESHOLD_RATIO / SURGE_THRESHOLD_DENOMINATOR;
    uint finalCapacityUsed = initialCapacityUsed + coverAmount;

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
    uint amount,
    uint totalCapacity
  ) internal pure returns (uint) {

    // surge price is applied for the capacity used above SURGE_THRESHOLD_RATIO.
    // the surge price starts at zero and increases linearly.
    // to simplify things, we're working with fractions/ratios instead of percentages,
    // ie 0 to 1 instead of 0% to 100%, 100% = 1 (a unit).
    //
    // surgeThreshold = SURGE_THRESHOLD_RATIO / SURGE_THRESHOLD_DENOMINATOR
    //                = 80_00 / 100_00 = 0.8
    //
    // for each percent of capacity used, the surge price increases by 10% per annum
    // which in fractions/ratios terms is a 0.1 increase for each 0.01 of capacity used
    // meaning an increase by 10 (equivalent of 1000%) for an entire unit
    //
    // priceIncreasePerUnit = SURGE_PRICE_RATIO / SURGE_PRICE_DENOMINATOR
    // coverToCapacityRatio = amount / totalCapacity
    // surgePriceStart = 0
    // surgePriceEnd = coverToCapacityRatio * priceIncreasePerUnit
    //
    // premium = amount * surgePriceEnd / 2
    //         = amount * coverToCapacityRatio * priceIncreasePerUnit / 2
    //         = amount * amount / totalCapacity * SURGE_PRICE_RATIO / SURGE_PRICE_DENOMINATOR / 2
    //         = amount * amount * SURGE_PRICE_RATIO / totalCapacity / SURGE_PRICE_DENOMINATOR / 2

    return amount * amount * SURGE_PRICE_RATIO / totalCapacity / SURGE_PRICE_DENOMINATOR / 2;
  }
}
