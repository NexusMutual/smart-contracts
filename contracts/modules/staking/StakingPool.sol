// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
// TODO: consider using solmate ERC721 implementation
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/INXMToken.sol";
import "../../libraries/Math.sol";

// total stake = active stake + expired stake
// product stake = active stake * product weight
// product stake = allocated product stake + free product stake
// on cover buys we allocate the free product stake and it becomes allocated.
// on expiration we deallocate the stake and it becomes free again

// ╭───────╼ Active stake ╾────────╮
// │                               │
// │     product weight            │
// │<────────────────────────>     │
// ├────╼ Product stake ╾────╮     │
// │                         │     │
// │ Allocated product stake │     │
// │   (used by covers)      │     │
// │                         │     │
// ├─────────────────────────┤     │
// │                         │     │
// │    Free product stake   │     │
// │                         │     │
// ╰─────────────────────────┴─────╯
//
// ╭───────╼ Expired stake ╾───────╮
// │                               │
// ╰───────────────────────────────╯

contract StakingPool is IStakingPool, ERC721{
  using SafeCast for uint;

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

  // tranche id => amount
  mapping(uint => ExpiredTranche) public expiredTranches;

  // pool bucket id => PoolBucket
  mapping(uint => PoolBucket) public poolBuckets;

  // product id => pool bucket id => ProductBucket
  mapping(uint => mapping(uint => ProductBucket)) public productBuckets;

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
  uint constant BUCKET_DURATION = 7 days;
  uint constant TRANCHE_DURATION = 91 days;
  uint constant MAX_ACTIVE_TRANCHES = 9; // 8 whole quarters + 1 partial quarter

  uint public constant REWARD_BONUS_PER_TRANCHE_RATIO = 10_00; // 10.00%
  uint public constant REWARD_BONUS_PER_TRANCHE_DENOMINATOR = 100_00;
  uint constant WEIGHT_DENOMINATOR = 100;
  uint constant REWARDS_DENOMINATOR = 100;
  uint constant FEE_DENOMINATOR = 100;

  uint public constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint public constant PRODUCT_WEIGHT_DENOMINATOR = 10_000;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 10_000;
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
    address _coverContract,
    ITokenController _tokenController
  ) ERC721(_name, _symbol) {
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

    poolId = _poolId;
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
      _rewardPerSecond -= poolBuckets[_firstActiveBucketId].rewardPerSecondCut;

      // should we expire a tranche?
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

      expiringTranche.stakeShares = 0;
      expiringTranche.rewardsShares = 0;

      // SSTORE
      tranches[_firstActiveTrancheId] = expiringTranche;
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

  function depositTo(DepositRequest[] memory requests) public returns (uint[] memory tokenIds) {

    if (isPrivatePool) {
      require(msg.sender == manager(), "StakingPool: The pool is private");
    }

    updateTranches();

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
          uint newEarningsPerShare = _accNxmPerRewardsShare - deposit.lastAccNxmPerRewardShare;
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
          uint newRewardPerShare = _accNxmPerRewardsShare - feeDeposit.lastAccNxmPerRewardShare;

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
    WithdrawParams[] memory params
  ) public returns (uint stakeToWithdraw, uint rewardsToWithdraw) {

    uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager());

    updateTranches();

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

      tokenController.withdrawNXMStakeAndRewards(
        ownerOf(tokenId),
        stakeToWithdraw,
        rewardsToWithdraw,
        poolId
      );
    }
  }

  function allocateStake(
    uint productId,
    uint period,
    uint gracePeriod,
    uint productStakeAmount,
    uint rewardRatio
  ) external onlyCoverContract returns (uint newAllocation, uint premium, uint rewardsInNXM) {

    updateTranches();

    Product memory product = products[productId];
    uint currentBucket = block.timestamp / BUCKET_DURATION;

    {
      uint lastBucket = product.lastBucket;

      // process expirations
      while (lastBucket < currentBucket) {
        ++lastBucket;
        product.allocatedStake -= productBuckets[productId][lastBucket].allocationCut;
      }
    }

    uint freeProductStake;
    {
      // tranche expiration must exceed the cover period
      uint _firstAvailableTrancheId = (block.timestamp + period + gracePeriod) / TRANCHE_DURATION;
      uint _firstActiveTrancheId = block.timestamp / TRANCHE_DURATION;

      // start with the entire supply and subtract unavailable tranches
      uint _stakeSharesSupply = stakeSharesSupply;
      uint availableShares = _stakeSharesSupply;

      for (uint i = _firstActiveTrancheId; i < _firstAvailableTrancheId; i++) {
        availableShares -= tranches[i].stakeShares;
      }

      // total stake available without applying product weight
      freeProductStake =
        activeStake * availableShares * product.targetWeight / _stakeSharesSupply / WEIGHT_DENOMINATOR;
    }

    // could happen if is 100% in-use or if the product weight was changed
    if (product.allocatedStake >= freeProductStake) {
      // store expirations
      products[productId].allocatedStake = product.allocatedStake;
      products[productId].lastBucket = currentBucket;
      return (0, 0, 0);
    }

    {
      uint usableStake = freeProductStake - product.allocatedStake;
      newAllocation = Math.min(productStakeAmount, usableStake);

      premium = calculatePremium(
        productId,
        product.allocatedStake,
        usableStake,
        newAllocation,
        period
      );
    }

    // 1 SSTORE
    products[productId].allocatedStake = product.allocatedStake + newAllocation;
    products[productId].lastBucket = currentBucket;

    {
      require(rewardRatio <= REWARDS_DENOMINATOR, "StakingPool: reward ratio exceeds denominator");

      // divCeil = fn(a, b) => (a + b - 1) / b
      uint expireAtBucket = (block.timestamp + period + BUCKET_DURATION - 1) / BUCKET_DURATION;

      rewardsInNXM = premium * rewardRatio / REWARDS_DENOMINATOR;
      uint _rewardPerSecond =
        rewardsInNXM
        / (expireAtBucket * BUCKET_DURATION - block.timestamp);

      // 2 SLOAD + 2 SSTORE
      productBuckets[productId][expireAtBucket].allocationCut += newAllocation;
      poolBuckets[expireAtBucket].rewardPerSecondCut += _rewardPerSecond;
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

      WithdrawParams[] memory withdrawParams = new WithdrawParams[](1);
      withdrawParams[0] = WithdrawParams(
        tokenId,
        true, // Withdraw deposit
        true, // Withdraw rewards
        trancheIds
      );

      (uint withdrawnStake, /* uint rewardsToWithdraw */) = withdraw(withdrawParams);

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

    // If the initial tranche is still active, move all the shares and pending rewards to the
    // newly chosen tranche and its coresponding deopsit.

    // First make sure tranches are up to date in terms of accumulated NXM rewards.
    updateTranches();

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
      uint newEarningsPerShare = _accNxmPerRewardsShare - initialDeposit.lastAccNxmPerRewardShare;
      rewardsToCarry = newEarningsPerShare * initialDeposit.rewardsShares
        + initialDeposit.pendingRewards;
    }

    Deposit memory updatedDeposit = deposits[tokenId][newTrancheId];

    // If a deposit lasting until the new tranche's end date already exists, calculate its pending
    // rewards before carrying over the rewards from the inital deposit.
    if (updatedDeposit.lastAccNxmPerRewardShare != 0) {
      uint newEarningsPerShare = _accNxmPerRewardsShare - updatedDeposit.lastAccNxmPerRewardShare;
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
    uint premium,
    uint /*globalRewardsRatio*/
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
    address to,
    uint256 tokenId
  ) internal override {
    if(tokenId == 0) {
      require(
        nxm.isLockedForMV(manager()) < block.timestamp,
        "StakingPool: Active pool assets are locked for voting in governance"
      );
    }
    super._beforeTokenTransfer(from, to, tokenId);
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
