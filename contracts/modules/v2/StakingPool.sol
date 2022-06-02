// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
// TODO: consider using solmate ERC721 implementation
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/INXMToken.sol";
import "../../utils/Math.sol";
import "../../utils/SafeUintCast.sol";
import "./StakingTypesLib.sol";
import "./StakingTypesLib.sol";

// total stake = active stake + expired stake
// total product capacity = active stake * product weight
// total product capacity = allocated product capacity + available product stake
// on cover buys we allocate the available product capacity
// on cover expiration we deallocate the capacity and it becomes available again

contract StakingPool is IStakingPool, ERC721 {
  using SafeUintCast for uint;
  using StakingTypesLib for CoverAmountGroup;
  using StakingTypesLib for CoverAmount;
  using StakingTypesLib for BucketTrancheGroup;

  /* storage */

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
  address public immutable coverContract;

  /* constants */

  // 7 * 13 = 91
  uint constant BUCKET_DURATION = 28 days;
  uint constant TRANCHE_DURATION = 91 days;
  uint constant MAX_ACTIVE_TRANCHES = 8; // 7 whole quarters + 1 partial quarter
  uint constant COVER_TRANCHE_GROUP_SIZE = 4;
  uint constant BUCKET_TRANCHE_GROUP_SIZE = 8;

  uint constant REWARDS_SHARES_RATIO = 125;
  uint constant REWARDS_SHARES_DENOMINATOR = 100;
  uint constant WEIGHT_DENOMINATOR = 100;
  uint constant REWARDS_DENOMINATOR = 100;
  uint constant FEE_DENOMINATOR = 100;

  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 10_000;
  uint public constant PRODUCT_WEIGHT_DENOMINATOR = 10_000;
  uint public constant INITIAL_PRICE_DENOMINATOR = 10_000;

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
    address _coverContract
  ) ERC721(_name, _symbol) {
    nxm = INXMToken(_token);
    coverContract = _coverContract;
  }

  function initialize(
    address _manager,
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    ProductInitializationParams[] calldata params
  ) external onlyCoverContract {

    isPrivatePool = _isPrivatePool;

    require(_initialPoolFee <= _maxPoolFee, "StakingPool: Pool fee should not exceed max pool fee");
    require(_maxPoolFee < 100, "StakingPool: Max pool fee cannot be 100%");

    poolFee = uint8(_initialPoolFee);
    maxPoolFee = uint8(_maxPoolFee);

    // TODO: initialize products
    params;

    // create ownership nft
    totalSupply = 1;
    _safeMint(_manager, 0);
  }

  // used to transfer all nfts when a user switches the membership to a new address
  function operatorTransfer(
    address from,
    address to,
    uint[] calldata tokenIds
  ) external onlyCoverContract {
    uint length = tokenIds.length;
    for (uint i = 0; i < length; i++) {
      _safeTransfer(from, to, tokenIds[i], "");
    }
  }

  function updateTranches() public {

    uint _firstActiveBucketId = firstActiveBucketId;
    uint _firstActiveTrancheId = firstActiveTrancheId;

    uint currentBucketId = block.timestamp / BUCKET_DURATION;
    uint currentTrancheId = block.timestamp / TRANCHE_DURATION;

    // populate if the pool is new
    if (_firstActiveBucketId == 0) {
      firstActiveBucketId = currentBucketId;
      firstActiveTrancheId = currentTrancheId;
      return;
    }

    if (_firstActiveBucketId == currentBucketId) {
      return;
    }

    // SLOAD
    uint _activeStake = activeStake;
    uint _rewardPerSecond = rewardPerSecond;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _lastAccNxmUpdate = lastAccNxmUpdate;

    while (_firstActiveBucketId < currentBucketId) {

      ++_firstActiveBucketId;
      uint bucketEndTime = _firstActiveBucketId * BUCKET_DURATION;
      uint elapsed = bucketEndTime - _lastAccNxmUpdate;

      // todo: should be allowed to overflow?
      // todo: handle division by zero
      _accNxmPerRewardsShare += elapsed * _rewardPerSecond / _rewardsSharesSupply;
      _lastAccNxmUpdate = bucketEndTime;
      // TODO: use _firstActiveBucketId before incrementing it?
      _rewardPerSecond -= rewardBuckets[_firstActiveBucketId].rewardPerSecondCut;

      // should we expire a tranche?
      // FIXME: this doesn't work with the new bucket size
      if (
        bucketEndTime % TRANCHE_DURATION != 0 ||
        _firstActiveTrancheId == currentTrancheId
      ) {
        continue;
      }

      // todo: handle _firstActiveTrancheId = 0 case

      // SLOAD
      Tranche memory expiringTranche = tranches[_firstActiveTrancheId];

      // todo: handle division by zero
      uint expiredStake = _activeStake * expiringTranche.stakeShares / _stakeSharesSupply;

      // the tranche is expired now so we decrease the stake and share supply
      _activeStake -= expiredStake;
      _stakeSharesSupply -= expiringTranche.stakeShares;
      _rewardsSharesSupply -= expiringTranche.rewardsShares;

      // todo: update nft 0

      // SSTORE
      delete tranches[_firstActiveTrancheId];
      expiredTranches[_firstActiveTrancheId] = ExpiredTranche(
        _accNxmPerRewardsShare, // accNxmPerRewardShareAtExpiry
        // TODO: should this be before or after active stake reduction?
        _activeStake, // stakeAmountAtExpiry
        _stakeSharesSupply // stakeShareSupplyAtExpiry
      );

      // advance to the next tranche
      _firstActiveTrancheId++;
    }

    {
      uint elapsed = block.timestamp - _lastAccNxmUpdate;
      _accNxmPerRewardsShare += elapsed * _rewardPerSecond / _rewardsSharesSupply;
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

  // todo: allow deposits to multiple tranches/nfts
  function depositTo(
    uint amount,
    uint trancheId,
    uint _tokenId,
    address destination
  ) external returns (uint tokenId) {

    if (isPrivatePool) {
      require(msg.sender == manager(), "StakingPool: The pool is private");
    }

    updateTranches();

    {
      uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;
      uint maxTranche = _firstActiveTrancheId + MAX_ACTIVE_TRANCHES;
      require(trancheId <= maxTranche, "StakingPool: Requested tranche is not yet active");
      require(trancheId >= _firstActiveTrancheId, "StakingPool: Requested tranche has expired");
      require(amount > 0, "StakingPool: Insufficient deposit amount");
    }

    // deposit to token id = 0 is not allowed
    // we treat it as a flag to create a new token
    bool isNewToken = _tokenId == 0;

    if (isNewToken) {
      tokenId = totalSupply++;
      address to = destination == address(0) ? msg.sender : destination;
      _mint(to, tokenId);
    } else {
      tokenId = _tokenId;
    }

    // transfer nxm from staker
    // TODO: use TokenController.operatorTransfer instead and transfer to TC
    nxm.transferFrom(msg.sender, address(this), amount);

    // storage reads
    uint _activeStake = activeStake;
    uint _stakeSharesSupply = stakeSharesSupply;
    uint _rewardsSharesSupply = rewardsSharesSupply;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    uint newStakeShares = _stakeSharesSupply == 0
      ? Math.sqrt(amount)
      : _stakeSharesSupply * amount / _activeStake;

    uint newRewardsShares = calculateRewardSharesAmount(newStakeShares, trancheId);

    // update deposit and pending reward
    {
      // conditional read
      Deposit memory deposit = isNewToken
        ? Deposit(_accNxmPerRewardsShare, 0, 0, 0)
        : deposits[tokenId][trancheId];

      // if we're increasing an existing deposit
      if (deposit.lastAccNxmPerRewardShare != 0) {
        uint newEarningsPerShare = _accNxmPerRewardsShare - deposit.lastAccNxmPerRewardShare;
        deposit.pendingRewards += newEarningsPerShare * deposit.rewardsShares;
      }

      deposit.stakeShares += newStakeShares;
      deposit.rewardsShares += newRewardsShares;
      deposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;

      // sstore
      deposits[tokenId][trancheId] = deposit;
    }

    // update pool manager's reward shares
    {
      Deposit memory feeDeposit = deposits[0][trancheId];

      {
        // create fee deposit reward shares
        uint newFeeRewardShares = newRewardsShares * poolFee / FEE_DENOMINATOR;
        newRewardsShares += newFeeRewardShares;

        // calculate rewards until now
        uint newRewardPerShare = _accNxmPerRewardsShare - feeDeposit.lastAccNxmPerRewardShare;

        feeDeposit.pendingRewards += newRewardPerShare * feeDeposit.rewardsShares;
        feeDeposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;
        feeDeposit.rewardsShares += newFeeRewardShares;
      }

      deposits[0][trancheId] = feeDeposit;
    }

    // update tranche
    {
      Tranche memory tranche = tranches[trancheId];
      tranche.stakeShares += newStakeShares;
      tranche.rewardsShares += newRewardsShares;
      tranches[trancheId] = tranche;
    }

    // update globals
    activeStake = _activeStake + amount;
    stakeSharesSupply = _stakeSharesSupply + newStakeShares;
    rewardsSharesSupply = _rewardsSharesSupply + newRewardsShares;
  }

  function calculateRewardSharesAmount(
    uint stakeSharesAmount,
    uint trancheId
  ) internal view returns (uint) {

    uint lockDuration = (trancheId + 1) * TRANCHE_DURATION - block.timestamp;
    uint maxLockDuration = TRANCHE_DURATION * 8;

    // TODO: determine extra rewards formula
    return
      stakeSharesAmount
      * REWARDS_SHARES_RATIO
      * lockDuration
      / REWARDS_SHARES_DENOMINATOR
      / maxLockDuration;
  }

  function withdraw(WithdrawRequest[] calldata params) external {

    updateTranches();

    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;
    uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;

    for (uint i = 0; i < params.length; i++) {

      uint stakeToWithdraw;
      uint rewardsToWithdraw;

      uint tokenId = params[i].tokenId;
      uint trancheCount = params[i].trancheIds.length;

      for (uint j = 0; j < trancheCount; j++) {

        uint trancheId = params[i].trancheIds[j];
        Deposit memory deposit = deposits[tokenId][trancheId];

        // can withdraw stake only if the tranche is expired
        if (params[i].withdrawStake && trancheId < _firstActiveTrancheId) {

          // calculate the amount of nxm for this deposit
          uint stake = expiredTranches[trancheId].stakeAmountAtExpiry;
          uint stakeShareSupply = expiredTranches[trancheId].stakeShareSupplyAtExpiry;
          stakeToWithdraw += stake * deposit.stakeShares / stakeShareSupply;

          // mark as withdrawn
          deposit.stakeShares = 0;
        }

        if (params[i].withdrawRewards) {

          // if the tranche is expired, use the accumulator value saved at expiration time
          uint accNxmPerRewardShareInUse = trancheId < _firstActiveTrancheId
            ? expiredTranches[trancheId].accNxmPerRewardShareAtExpiry
            : _accNxmPerRewardsShare;

          // calculate reward since checkpoint
          uint newRewardPerShare = accNxmPerRewardShareInUse - deposit.lastAccNxmPerRewardShare;
          rewardsToWithdraw += newRewardPerShare * deposit.rewardsShares + deposit.pendingRewards;

          // save checkpoint
          deposit.lastAccNxmPerRewardShare = _accNxmPerRewardsShare;
          deposit.pendingRewards = 0;
          deposit.rewardsShares = 0;
        }

        deposits[tokenId][trancheId] = deposit;
      }

      uint withdrawable = stakeToWithdraw + rewardsToWithdraw;

      // TODO: use TC instead
      nxm.transfer(ownerOf(tokenId), withdrawable);
    }
  }

  function allocateStake(
    CoverRequest calldata request
  ) external onlyCoverContract returns (uint allocatedAmount, uint premium) {

    updateTranches();

    // process expirations
    uint gracePeriodExpiration = block.timestamp + request.period + request.gracePeriod;
    uint firstTrancheIdToUse = gracePeriodExpiration / TRANCHE_DURATION;
    uint trancheCount = (block.timestamp / TRANCHE_DURATION + MAX_ACTIVE_TRANCHES) - firstTrancheIdToUse + 1;

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

        uint freeTrancheCapacity = totalCapacities[i] - trancheAllocatedCapacities[i];
        uint allocate = Math.min(freeTrancheCapacity, remainingAmount);

        remainingAmount -= allocate;
        allocatedAmount += allocate;
        trancheAllocatedCapacities[i] += allocate;
        coverTrancheAllocation[i] = allocate;

        if (remainingAmount == 0) {
          break;
        }
      }

      storeAllocatedCapacities(
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        trancheAllocatedCapacities
      );

      storeExpiringCoverAmounts(
        request.coverId,
        request.productId,
        firstTrancheIdToUse,
        trancheCount,
        gracePeriodExpiration / BUCKET_DURATION + 1,
        coverTrancheAllocation
      );
    }

    premium = calculatePremium(
      request.productId,
      totalAllocatedCapacity,
      totalCapacity,
      allocatedAmount,
      request.period
    );

    {
      require(request.rewardRatio <= REWARDS_DENOMINATOR, "StakingPool: reward ratio exceeds denominator");

      // divCeil = fn(a, b) => (a + b - 1) / b
      uint expireAtBucket = (block.timestamp + request.period + BUCKET_DURATION - 1) / BUCKET_DURATION;
      uint _rewardPerSecond =
        premium *
        request.rewardRatio /
        REWARDS_DENOMINATOR
        / (expireAtBucket * BUCKET_DURATION - block.timestamp);

      // 1 SLOAD + 1 SSTORE
      rewardBuckets[expireAtBucket].rewardPerSecondCut += _rewardPerSecond;
    }

    return (allocatedAmount, premium);
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
      uint trancheGroupId = trancheId / COVER_TRANCHE_GROUP_SIZE;
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

  function storeAllocatedCapacities(
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

  function storeExpiringCoverAmounts(
    uint coverId,
    uint productId,
    uint firstTrancheId,
    uint trancheCount,
    uint targetBucketId,
    uint[] memory coverTrancheAllocation
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

      packedCoverTrancheAllocation |= (trancheAllocation << uint32(i * 32));

      // setItemAt does not mutate so we have to reassign it
      bucketTrancheGroups[trancheGroupId] = bucketTrancheGroups[trancheGroupId].setItemAt(
        trancheIndexInGroup,
        expiringAmount + trancheAllocation
      );
    }

    coverTrancheAllocations[coverId] = packedCoverTrancheAllocation;

    for (uint i = 0; i < groupCount; i++) {
      expiringCoverBuckets[productId][targetBucketId][firstGroupId + i] = bucketTrancheGroups[i];
    }
  }

  function calculatePremium(
    uint productId,
    uint allocatedStake,
    uint usableStake,
    uint newAllocation,
    uint period
  ) public returns (uint) {

    // silence compiler warnings
    allocatedStake;
    usableStake;
    newAllocation;
    period;
    block.timestamp;
    uint96 nextPrice = 0;
    products[productId].lastPrice = nextPrice;

    return 0;
  }

  function deallocateStake(
    uint productId,
    uint start,
    uint period,
    uint amount,
    uint premium
  ) external onlyCoverContract {

    // silence compiler warnings
    productId;
    start;
    period;
    amount;
    premium;
    activeStake = activeStake;
  }

  // O(1)
  function burnStake(uint productId, uint start, uint period, uint amount) external onlyCoverContract {

    productId;
    start;
    period;

    // TODO: free up the stake used by the corresponding cover
    // TODO: check if it's worth restricting the burn to 99% of the active stake

    updateTranches();

    uint _activeStake = activeStake;
    activeStake = _activeStake > amount ? _activeStake - amount : 0;
  }

  /* nft */

  function _beforeTokenTransfer(
    address from,
    address /*to*/,
    uint256 tokenId
  ) internal view override {
    require(
      tokenId != 0 || nxm.isLockedForMV(from) < block.timestamp,
      "StakingPool: Locked for voting in governance"
    );
    // todo: track owned zero-id nfts in TC
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
    block.timestamp;
    // prevents warning about function being pure
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
    params;
  }

  function removeProducts(uint[] memory productIds) external onlyManager {
    productIds;
  }

  function setPoolFee(uint newFee) external onlyManager {

    require(newFee <= maxPoolFee, "StakingPool: new fee exceeds max fee");
    uint oldFee = poolFee;
    poolFee = uint8(newFee);

    updateTranches();

    uint fromTrancheId = firstActiveTrancheId;
    uint toTrancheId = fromTrancheId + MAX_ACTIVE_TRANCHES;
    uint _accNxmPerRewardsShare = accNxmPerRewardsShare;

    for (uint trancheId = fromTrancheId; trancheId <= toTrancheId; trancheId++) {

      // sload
      Deposit memory feeDeposit = deposits[0][trancheId];

      if (feeDeposit.rewardsShares == 0) {
        continue;
      }

      // update pending reward and reward shares
      uint newRewardPerRewardsShare = _accNxmPerRewardsShare - feeDeposit.lastAccNxmPerRewardShare;
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
    lastBasePrice = products[productId].lastPrice;
    targetPrice = products[productId].targetPrice;
  }
}
