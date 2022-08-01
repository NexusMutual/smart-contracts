// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
// TODO: consider using solmate ERC721 implementation
//import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import { ERC721 as SolmateERC721 } from "@rari-capital/solmate/src/tokens/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/Strings.sol";

//import "../../interfaces/ISolmateERC721.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/INXMToken.sol";
import "../../libraries/Math.sol";
import "../../libraries/UncheckedMath.sol";
import "../../libraries/SafeUintCast.sol";
import "./StakingTypesLib.sol";
import "hardhat/console.sol";

// total stake = active stake + expired stake
// total capacity = active stake * global capacity factor
// total product capacity = total capacity * capacity reduction factor * product weight
// total product capacity = allocated product capacity + available product capacity
// on cover buys we allocate the available product capacity
// on cover expiration we deallocate the capacity and it becomes available again

contract StakingPool is IStakingPool, SolmateERC721 {
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
  mapping(uint => Product) public products;

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
  uint public constant REWARDS_DENOMINATOR = 100;
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

  modifier onlyCoverContract {
    require(msg.sender == coverContract, "StakingPool: Only Cover contract can call this function");
    _;
  }

  modifier onlyManager {
    require(_isApprovedOrOwner(msg.sender, 0), "StakingPool: Only pool manager can call this function");
    _;
  }

  constructor (
    string memory _name,
    string memory _symbol,
    address _token,
    address _coverContract,
    ITokenController _tokenController
  ) SolmateERC721(_name, _symbol) {
    nxm = INXMToken(_token);
    coverContract = _coverContract;
    tokenController = _tokenController;
  }

  function _isApprovedOrOwner(address spender, uint tokenId) public view returns (bool) {
    address owner = ownerOf(tokenId);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[tokenId];
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
    name = string(abi.encodePacked(name, " ", Strings.toString(poolId)));

    // TODO: initialize products
    params;

    // create ownership nft
    totalSupply = 1;
    _mint(_manager, 0);
  }

  function tokenURI(uint256 id) public pure override returns (string memory) {
    id;  // To silence unused param warning. Remove once fn is implemented
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

    // skip if the pool is new
    if (_firstActiveBucketId == 0) {
      return;
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
      // nothing to do
      firstActiveBucketId = currentBucketId;
      firstActiveTrancheId = currentTrancheId;
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
      require(msg.sender == manager(), "StakingPool: The pool is private");
    }

    updateTranches(true);

    // storage reads
    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint maxTranche = _firstActiveTrancheId + MAX_ACTIVE_TRANCHES;

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
      bool isNewToken = request.tokenId == 0;

      if (isNewToken) {
        tokenIds[i] = totalSupply++;
        address to = request.destination == address(0) ? msg.sender : request.destination;
        _mint(to, request.tokenId);
      } else {
        tokenIds[i] = request.tokenId;
      }

      uint newStakeShares = _stakeSharesSupply == 0
        ? Math.sqrt(request.amount)
        : _stakeSharesSupply * request.amount / _activeStake;

      uint newRewardsShares;

      // update deposit and pending reward
      {
        // conditional read
        Deposit memory deposit = isNewToken
          ? Deposit(_accNxmPerRewardsShare, 0, 0, 0)
          : deposits[request.tokenId][request.trancheId];

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
        deposits[request.tokenId][request.trancheId] = deposit;
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

    // transfer nxm from staker and update pool deposit balance
    tokenController.depositStakedNXM(msg.sender, totalAmount, poolId);

    // update globals
    activeStake = _activeStake;
    stakeSharesSupply = _stakeSharesSupply;
    rewardsSharesSupply = _rewardsSharesSupply;
  }

  function getTimeLeftOfTranche(uint trancheId, uint blockTimestamp) internal pure returns (uint) {
    uint endDate = (trancheId + 1) * TRANCHE_DURATION;
    if (endDate > blockTimestamp) {
      return endDate - blockTimestamp;
    }
    return 0;
  }

  /// Calculates the amount of new reward shares based on the initial and new stake shares and
  /// tranche.
  ///
  /// @param initialStakeShares   The amount of stake shares that the deposit is already entitled
  ///                             to.
  /// @param stakeSharesIncrease  The amount o new stake shares that the deposit will entitled to
  ///                             on top of the existing ones.
  /// @param initialTrancheId     The initial id of the tranche that defines the deposit period.
  /// @param newTrancheId         The new id of the tranche that will define the deposit period.
  /// @param blockTimestamp       The timestamp of the block when the new shares are recalculated.
  function calculateNewRewardShares(
    uint initialStakeShares,
    uint stakeSharesIncrease,
    uint initialTrancheId,
    uint newTrancheId,
    uint blockTimestamp
  ) public pure returns (uint) {
    uint timeLeftOfInitialTranche = getTimeLeftOfTranche(initialTrancheId, blockTimestamp);
    uint timeLeftOfNewTranche = getTimeLeftOfTranche(newTrancheId, blockTimestamp);

    // A new bonus is calculated based on the the time left until the new tranche ends and the
    // total amount of stake shares (initial + new).
    uint newBonusShares = (initialStakeShares + stakeSharesIncrease)
      * REWARD_BONUS_PER_TRANCHE_RATIO
      * timeLeftOfNewTranche
      / TRANCHE_DURATION
      / REWARD_BONUS_PER_TRANCHE_DENOMINATOR;

    // In case of existing deposits the previous bonus is deducted from the final amount of new
    // shares. The new bonus shares are recalculated based on the total stake shares and it
    // already includes a potentially larger amount of shares (when the deposit is extended to
    // a tranche ending futher into the future) that account for the initial stake shares.
    uint previousBonusSharesDeduction = initialStakeShares
      * REWARD_BONUS_PER_TRANCHE_RATIO
      * timeLeftOfInitialTranche
      / TRANCHE_DURATION
      / REWARD_BONUS_PER_TRANCHE_DENOMINATOR;

    // Return one reward share per stake share, add the newly calculated bonus shares and deduct the
    // previous ones.
    return stakeSharesIncrease + newBonusShares - previousBonusSharesDeduction;
  }

  function withdraw(
    WithdrawRequest[] memory params
  ) public returns (uint stakeToWithdraw, uint rewardsToWithdraw) {

    uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager());

    // pass false as it does not modify the share supply nor the reward per second
    updateTranches(false);

    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;

    for (uint i = 0; i < params.length; i++) {

      uint tokenId = params[i].tokenId;
      uint trancheCount = params[i].trancheIds.length;

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
    uint trancheCount = (block.timestamp / TRANCHE_DURATION + MAX_ACTIVE_TRANCHES) - firstTrancheIdToUse + 1;

    console.log("TRANCHE_DURATION", TRANCHE_DURATION);
    console.log("gracePeriodExpiration", gracePeriodExpiration);

    return ( request.amount, request.amount * 2 / 100,  request.amount * 2 / 100);
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
    uint trancheCount = (coverStartTime / TRANCHE_DURATION + MAX_ACTIVE_TRANCHES) - firstTrancheIdToUse + 1;

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
        uint amountPerTranche = uint32(packedCoverTrancheAllocation >> (i * 8));
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

    console.log("groupCount", groupCount);
    CoverAmountGroup[] memory coverAmountGroups = new CoverAmountGroup[](groupCount);
    CoverAmount[] memory coverAmounts = new CoverAmount[](trancheCount);

    for (uint i = 0; i < groupCount; i++) {
      coverAmountGroups[i] = activeCoverAmounts[productId][firstGroupId + i];
    }

    // flatten groups
    for (uint i = 0; i < trancheCount; i++) {
      uint trancheId = firstTrancheId + i;
      uint trancheGroupId = trancheId / COVER_TRANCHE_GROUP_SIZE;
      uint trancheIndexInGroup = trancheId % COVER_TRANCHE_GROUP_SIZE;

      console.log("firstTrancheId", firstTrancheId);
      console.log("trancheId", trancheId);
      console.log("trancheGroupId", trancheGroupId);
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
      uint trancheGroupId = trancheId / BUCKET_TRANCHE_GROUP_SIZE;
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

    uint16 lastBucketId = coverAmounts[0].lastBucketId();
    uint currentBucket = block.timestamp / BUCKET_DURATION;

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
    uint weight = products[productId].targetWeight;

    totalCapacities = new uint[](trancheCount);
    totalCapacity = 0;

    uint multiplier = capacityRatio * (CAPACITY_REDUCTION_DENOMINATOR - reductionRatio) * weight;
    uint denominator = GLOBAL_CAPACITY_DENOMINATOR * CAPACITY_REDUCTION_DENOMINATOR * WEIGHT_DENOMINATOR;

    for (uint i = 0; i <= trancheCount; i++) {
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
      uint trancheGroupId = trancheId / COVER_TRANCHE_GROUP_SIZE;
      uint trancheIndexInGroup = trancheId % COVER_TRANCHE_GROUP_SIZE;

      // setItemAt does not mutate so we have to reassign it
      coverAmountGroups[trancheGroupId] = coverAmountGroups[trancheGroupId].setItemAt(
        trancheIndexInGroup,
        StakingTypesLib.newCoverAmount(allocatedCapacities[i].toUint48(), currentBucket)
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
      uint trancheGroupId = trancheId / BUCKET_TRANCHE_GROUP_SIZE;
      uint trancheIndexInGroup = trancheId % BUCKET_TRANCHE_GROUP_SIZE;

      uint32 expiringAmount = bucketTrancheGroups[trancheGroupId].getItemAt(trancheIndexInGroup);
      uint32 trancheAllocation = coverTrancheAllocation[i].toUint32();

      if (isAllocation) {
        expiringAmount += trancheAllocation;
        packedCoverTrancheAllocation |= trancheAllocation << uint32(i * 32);
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
  /// @dev Only the NFT owner and the authorized addresses can call this function. Pool manager
  /// NFTs cannot be extended.
  ///
  /// @param tokenId           The id of the NFT that proves the ownership of the deposit.
  /// @param initialTrancheId  The id of the tranche the deposit is already a part of.
  /// @param newTrancheId      The id of the new tranche determining the new deposit period.
  /// @param topUpAmount       An optional amount if the user wants to also increase the deposit
  ///                          amount.
  function extendDeposit(
    uint tokenId,
    uint initialTrancheId,
    uint newTrancheId,
    uint topUpAmount
  ) public {
    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
    uint maxTranche = _firstActiveTrancheId + MAX_ACTIVE_TRANCHES;

    // Token id 0 does not wrap actual deposits but instead it is used to determine who the pool
    // manager is and to calculate his reward shares according to the pool fee. In other words,
    // it holds no stake the would expire at the end of a certain tranche, only rewards from fees.
    // If the manager wishes to make a deposit, he will use the same mechanism like everyone else
    // by minting a different NFT with id > 0.
    require(tokenId != 0, "StakingPool: Invalid token id");

    require(
      _isApprovedOrOwner(msg.sender, tokenId),
      "StakingPool: Not authorized to extend deposits on this token"
    );
    require(
      initialTrancheId < newTrancheId,
      "StakingPool: The chosen tranche cannot end before the initial one"
    );
    require(newTrancheId <= maxTranche, "StakingPool: The chosen tranche is not available yet");
    require(
      newTrancheId >= _firstActiveTrancheId,
      "StakingPool: The chosen tranche has already reached the maturity date"
    );

    // If the intial tranche is expired, withdraw everything and make a new deposit equal to the
    // withdrawn stake amount plus a top up amount if applicable. This will require the user to
    // grant sufficient allowance beforehand.
    if (initialTrancheId < _firstActiveTrancheId) {
      uint[] memory trancheIds = new uint[](1);
      trancheIds[0] = initialTrancheId;

      WithdrawRequest[] memory withdrawRequests = new WithdrawRequest[](1);
      withdrawRequests[0] = WithdrawRequest(
        tokenId,
        true, // Withdraw deposit
        true, // Withdraw rewards
        trancheIds
      );

      (uint withdrawnStake, /* uint rewardsToWithdraw */) = withdraw(withdrawRequests);

      DepositRequest[] memory depositRequests;
      depositRequests[0] = (
        DepositRequest(
          withdrawnStake + topUpAmount, // amount
          newTrancheId,                 // trancheId
          tokenId,                      // tokenId
          msg.sender                    // destination
        )
      );

      depositTo(depositRequests);

      return; // Done! Skip the rest of the function.
    }

    // if the initial tranche is still active, move all the shares and pending rewards to the
    // newly chosen tranche and its coresponding deopsit.

    // first make sure tranches are up to date in terms of accumulated NXM rewards.
    // passing true because we mint reward shares
    updateTranches(true);

    Deposit memory initialDeposit = deposits[tokenId][initialTrancheId];

    // Calculate the new stake shares if there's also a deposit top up.
    uint newStakeShares;
    if (topUpAmount > 0) {
      newStakeShares = stakeSharesSupply * topUpAmount / activeStake;
      activeStake += topUpAmount;
    }

    // Calculate the new reward shares
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

      // The user's shares are moved from the initial tranche to the new one.
      initialTranche.stakeShares -= initialDeposit.stakeShares;
      initialTranche.rewardsShares -= initialDeposit.rewardsShares;
      newTranche.stakeShares += initialDeposit.stakeShares + newStakeShares;
      newTranche.rewardsShares += initialDeposit.rewardsShares + newRewardsShares;

      // Store the updated tranches.
      tranches[initialTrancheId] = initialTranche;
      tranches[newTrancheId] = newTranche;
    }

    // Calculate the rewards that will be carried from the initial deposit to the next one.
    uint rewardsToCarry;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    {
      uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(initialDeposit.lastAccNxmPerRewardShare);
      rewardsToCarry = newEarningsPerShare * initialDeposit.rewardsShares + initialDeposit.pendingRewards;
    }

    Deposit memory updatedDeposit = deposits[tokenId][newTrancheId];

    // If a deposit lasting until the new tranche's end date already exists, calculate its pending
    // rewards before carrying over the rewards from the inital deposit.
    if (updatedDeposit.lastAccNxmPerRewardShare != 0) {
      uint newEarningsPerShare = _accNxmPerRewardsShare.uncheckedSub(updatedDeposit.lastAccNxmPerRewardShare);
      updatedDeposit.pendingRewards += newEarningsPerShare * updatedDeposit.rewardsShares;
    }

    // The carried rewards are added to the pending rewards of the new depostit.
    updatedDeposit.pendingRewards += rewardsToCarry;

    // Update the last value of accumulated NXM per share in the new deposit.
    updatedDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;


    // Move the user's shares from the initial deposit to the new one. The updated deposit can
    // already exist so the new shares are added on top of the existing ones.
    updatedDeposit.rewardsShares += initialDeposit.rewardsShares + newRewardsShares;
    updatedDeposit.stakeShares += initialDeposit.stakeShares + newStakeShares;

    // Reset the initial deposit. This sets the pending rewards and shares from the intial deposit
    // to zero since at this point they are already carried over to the new one and the last value
    // of accumulated NXM per share in the initial deposit is also set to 0 in case the user
    // decides to make another another one until the end of initial tranche, because in that case
    // it needs to be treated as a new deposit, not as deposit increase.
    delete deposits[tokenId][initialTrancheId];

    // Store the new deposit.
    deposits[tokenId][newTrancheId] = updatedDeposit;

    // Update global shares supply
    stakeSharesSupply += newStakeShares;
    rewardsSharesSupply += newRewardsShares;
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

  /* pool management */

  function setProductDetails(ProductParams[] memory params) external onlyManager {
    // silence compiler warnings
    params;
    activeStake = activeStake;
    // [todo] Implement
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

  /* management */

  function addProducts(ProductParams[] memory params) external onlyManager {
    totalSupply = totalSupply;  // To silence view fn warning. Remove once implemented
    params;
  }

  function removeProducts(uint[] memory productIds) external onlyManager {
    totalSupply = totalSupply;  // To silence view fn warning. Remove once implemented
    productIds;
  }

  function setPoolFee(uint newFee) external onlyManager {

    require(newFee <= maxPoolFee, "StakingPool: new fee exceeds max fee");
    uint oldFee = poolFee;
    poolFee = uint8(newFee);

    // passing true because the amount of rewards shares changes
    updateTranches(true);

    uint fromTrancheId = block.timestamp / TRANCHE_DURATION;
    uint toTrancheId = fromTrancheId + MAX_ACTIVE_TRANCHES;
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

    Product memory product = products[productId];

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
