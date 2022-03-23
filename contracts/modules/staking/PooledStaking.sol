// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAware.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/IStakingPool.sol";

contract PooledStaking is IPooledStaking, MasterAware {
  /* Events */

  // deposits
  event Deposited(address indexed staker, uint amount);
  event Withdrawn(address indexed staker, uint amount);

  // stakes
  event Staked(address indexed contractAddress, address indexed staker, uint amount);
  event UnstakeRequested(address indexed contractAddress, address indexed staker, uint amount, uint unstakeAt);
  event Unstaked(address indexed contractAddress, address indexed staker, uint amount);

  // burns
  event BurnRequested(address indexed contractAddress, uint amount);
  event Burned(address indexed contractAddress, uint amount, uint contractStakeBeforeBurn);

  // rewards
  event RewardAdded(address indexed contractAddress, uint amount);
  event RewardRequested(address indexed contractAddress, uint amount);
  event Rewarded(address indexed contractAddress, uint amount, uint contractStake);
  event RewardWithdrawn(address indexed staker, uint amount);

  // pending actions processing
  event PendingActionsProcessed(bool finished);

  ICover public immutable cover;
  IProductsV1 public immutable productsV1;

  /* Storage variables */

  bool public initialized;

  INXMToken public token;
  ITokenController public tokenController;

  uint public MIN_STAKE;         // Minimum allowed stake per contract
  uint public MAX_EXPOSURE;      // Stakes sum must be less than the deposit amount times this
  uint public MIN_UNSTAKE;       // Forbid unstake of small amounts to prevent spam
  uint public UNSTAKE_LOCK_TIME; // Lock period in seconds before unstaking takes place

  mapping(address => Staker) public stakers;     // stakerAddress => Staker

  // temporary variables
  uint public contractStaked;   // used when processing burns and rewards
  uint public contractBurned;   // used when processing burns
  uint public contractRewarded; // used when processing rewards

  // list of stakers for all contracts
  mapping(address => address[]) public contractStakers;

  // there can be only one pending burn
  Burn public burn;

  mapping(uint => Reward) public rewards; // reward id => Reward
  uint public firstReward;
  uint public lastRewardId;

  mapping(uint => UnstakeRequest) public unstakeRequests; // unstake id => UnstakeRequest
  // firstUnstakeRequest is stored at unstakeRequests[0].next
  uint public lastUnstakeRequestId;

  uint public processedToStakerIndex; // we processed the action up this staker
  bool public isContractStakeCalculated; // flag to indicate whether staked amount is up to date or not

  /* state vars for rewards groupping upgrade */

  // rewards to be distributed at the end of the current round
  // contract address => ContractRewards
  mapping(address => ContractReward) public accumulatedRewards;

  uint public REWARD_ROUND_DURATION;
  uint public REWARD_ROUNDS_START;

  /* Modifiers */

  modifier noPendingActions {
    require(!hasPendingActions(), "Unable to execute request with unprocessed actions");
    _;
  }

  modifier noPendingBurns {
    require(!hasPendingBurns(), "Unable to execute request with unprocessed burns");
    _;
  }

  modifier noPendingUnstakeRequests {
    require(!hasPendingUnstakeRequests(), "Unable to execute request with unprocessed unstake requests");
    _;
  }

  modifier noPendingRewards {
    require(!hasPendingRewards(), "Unable to execute request with unprocessed rewards");
    _;
  }

  modifier whenNotPausedAndInitialized {
    require(!master.isPause(), "System is paused");
    require(initialized, "Contract is not initialized");
    _;
  }

  constructor(address coverAddress, address productsV1Address) {
    productsV1 = IProductsV1(productsV1Address);
    cover = ICover(coverAddress);
  }

  /* Getters and view functions */

  function contractStakerCount(address contractAddress) external view returns (uint) {
    return contractStakers[contractAddress].length;
  }

  function contractStakerAtIndex(address contractAddress, uint stakerIndex) external view returns (address) {
    return contractStakers[contractAddress][stakerIndex];
  }

  function contractStakersArray(address contractAddress) external view returns (address[] memory _stakers) {
    return contractStakers[contractAddress];
  }

  function contractStake(address contractAddress) public override view returns (uint) {

    address[] storage _stakers = contractStakers[contractAddress];
    uint stakerCount = _stakers.length;
    uint stakedOnContract;

    for (uint i = 0; i < stakerCount; i++) {
      Staker storage staker = stakers[_stakers[i]];
      uint deposit = staker.deposit;
      uint stake = staker.stakes[contractAddress];

      // add the minimum of the two
      stake = deposit < stake ? deposit : stake;
      stakedOnContract = stakedOnContract + stake;
    }

    return stakedOnContract;
  }

  function stakerContractCount(address staker) external view returns (uint) {
    return stakers[staker].contracts.length;
  }

  function stakerContractAtIndex(address staker, uint contractIndex) external view returns (address) {
    return stakers[staker].contracts[contractIndex];
  }

  function stakerContractsArray(address staker) external view returns (address[] memory) {
    return stakers[staker].contracts;
  }

  function stakerContractStake(address staker, address contractAddress) external override view returns (uint) {
    uint stake = stakers[staker].stakes[contractAddress];
    uint deposit = stakers[staker].deposit;
    return stake < deposit ? stake : deposit;
  }

  function stakerContractPendingUnstakeTotal(address staker, address contractAddress) external view returns (uint) {
    return stakers[staker].pendingUnstakeRequestsTotal[contractAddress];
  }

  function stakerReward(address staker) external override view returns (uint) {
    return stakers[staker].reward;
  }

  function stakerDeposit(address staker) external override view returns (uint) {
    return stakers[staker].deposit;
  }

  function stakerMaxWithdrawable(address stakerAddress) public override view returns (uint) {

    Staker storage staker = stakers[stakerAddress];
    uint deposit = staker.deposit;
    uint totalStaked;
    uint maxStake;

    for (uint i = 0; i < staker.contracts.length; i++) {

      address contractAddress = staker.contracts[i];
      uint initialStake = staker.stakes[contractAddress];
      uint stake = deposit < initialStake ? deposit : initialStake;
      totalStaked = totalStaked + stake;

      if (stake > maxStake) {
        maxStake = stake;
      }
    }

    uint minRequired = totalStaked / MAX_EXPOSURE;
    uint locked = maxStake > minRequired ? maxStake : minRequired;

    return deposit - locked;
  }

  function unstakeRequestAtIndex(uint unstakeRequestId) external view returns (
    uint amount, uint unstakeAt, address contractAddress, address stakerAddress, uint next
  ) {
    UnstakeRequest storage unstakeRequest = unstakeRequests[unstakeRequestId];
    amount = unstakeRequest.amount;
    unstakeAt = unstakeRequest.unstakeAt;
    contractAddress = unstakeRequest.contractAddress;
    stakerAddress = unstakeRequest.stakerAddress;
    next = unstakeRequest.next;
  }

  function hasPendingActions() public override view returns (bool) {
    return hasPendingBurns() || hasPendingUnstakeRequests() || hasPendingRewards();
  }

  function hasPendingBurns() public view returns (bool) {
    return burn.burnedAt != 0;
  }

  function hasPendingUnstakeRequests() public view returns (bool){

    uint nextRequestIndex = unstakeRequests[0].next;

    if (nextRequestIndex == 0) {
      return false;
    }

    return unstakeRequests[nextRequestIndex].unstakeAt <= block.timestamp;
  }

  function hasPendingRewards() public view returns (bool){
    return rewards[firstReward].rewardedAt != 0;
  }

  /* State-changing functions */

  function depositAndStake(
    uint amount,
    address[] calldata _contracts,
    uint[] calldata _stakes
  ) external {
    /* noop */
  }

  function withdraw(uint amount) external override whenNotPausedAndInitialized onlyMember noPendingBurns {
    stakers[msg.sender].deposit = stakers[msg.sender].deposit - amount;
    token.transfer(msg.sender, amount);
    emit Withdrawn(msg.sender, amount);
  }

  function requestUnstake(
    address[] calldata _contracts,
    uint[] calldata _amounts,
    uint _insertAfter // unstake request id after which the new unstake request will be inserted
  ) external whenNotPausedAndInitialized onlyMember {
    /* noop */
  }

  function withdrawReward(address stakerAddress) external override whenNotPausedAndInitialized {

    uint amount = stakers[stakerAddress].reward;
    stakers[stakerAddress].reward = 0;

    token.transfer(stakerAddress, amount);

    emit RewardWithdrawn(stakerAddress, amount);
  }

  function pushBurn(
    address contractAddress, uint amount
  ) public override onlyInternal whenNotPausedAndInitialized noPendingBurns {

    address[] memory contractAddresses = new address[](1);
    contractAddresses[0] = contractAddress;
    _pushRewards(contractAddresses, true);

    burn.amount = amount;
    burn.burnedAt = block.timestamp;
    burn.contractAddress = contractAddress;

    emit BurnRequested(contractAddress, amount);
  }

  function _getCurrentRewardsRound() internal view returns (uint) {

    uint roundDuration = REWARD_ROUND_DURATION;
    uint startTime = REWARD_ROUNDS_START;

    require(startTime != 0, "REWARD_ROUNDS_START is not initialized");

    return block.timestamp <= startTime ? 0 : (block.timestamp - startTime) / roundDuration;
  }

  function getCurrentRewardsRound() external view returns (uint) {
    return _getCurrentRewardsRound();
  }

  /**
   * @dev Pushes accumulated rewards to the processing queue.
   */
  function _pushRewards(address[] memory contractAddresses, bool skipRoundCheck) internal {

    uint currentRound = _getCurrentRewardsRound();
    uint lastRewardIdCounter = lastRewardId;
    uint pushedRewards = 0;

    for (uint i = 0; i < contractAddresses.length; i++) {

      address contractAddress = contractAddresses[i];
      ContractReward storage contractRewards = accumulatedRewards[contractAddress];
      uint lastRound = contractRewards.lastDistributionRound;
      uint amount = contractRewards.amount;

      bool shouldPush = amount > 0 && (skipRoundCheck || currentRound > lastRound);

      if (!shouldPush) {
        // prevent unintended distribution of the first reward in round
        if (lastRound != currentRound) {
          contractRewards.lastDistributionRound = currentRound;
        }
        continue;
      }

      rewards[++lastRewardIdCounter] = Reward(amount, block.timestamp, contractAddress);
      emit RewardRequested(contractAddress, amount);

      contractRewards.amount = 0;
      contractRewards.lastDistributionRound = currentRound;
      ++pushedRewards;

      if (pushedRewards == 1 && firstReward == 0) {
        firstReward = lastRewardIdCounter;
      }
    }

    if (pushedRewards != 0) {
      lastRewardId = lastRewardIdCounter;
    }
  }

  /**
   * @dev External function for pushing accumulated rewards in the processing queue.
   * @dev `_pushRewards` checks the current round and will only push if rewards can be distributed.
   */
  function pushRewards(address[] calldata contractAddresses) external whenNotPausedAndInitialized {
    _pushRewards(contractAddresses, false);
  }

  /**
   * @dev Add reward for contract. Automatically triggers distribution if enough time has passed.
   */
  function accumulateReward(address contractAddress, uint amount) external override onlyInternal whenNotPausedAndInitialized {

    // will push rewards if needed
    address[] memory contractAddresses = new address[](1);
    contractAddresses[0] = contractAddress;
    _pushRewards(contractAddresses, false);

    ContractReward storage contractRewards = accumulatedRewards[contractAddress];
    contractRewards.amount = contractRewards.amount + amount;
    emit RewardAdded(contractAddress, amount);
  }

  function processPendingActions(uint maxIterations) public override whenNotPausedAndInitialized returns (bool finished) {
    (finished,) = _processPendingActions(maxIterations);
  }

  function processPendingActionsReturnLeft(uint maxIterations) public whenNotPausedAndInitialized returns (bool finished, uint iterationsLeft) {
    (finished, iterationsLeft) = _processPendingActions(maxIterations);
  }

  function _processPendingActions(uint maxIterations) public whenNotPausedAndInitialized returns (bool finished, uint iterationsLeft) {

    iterationsLeft = maxIterations;

    while (true) {

      uint firstUnstakeRequestIndex = unstakeRequests[0].next;
      UnstakeRequest storage unstakeRequest = unstakeRequests[firstUnstakeRequestIndex];
      Reward storage reward = rewards[firstReward];

      // read storage and cache in memory
      uint burnedAt = burn.burnedAt;
      uint rewardedAt = reward.rewardedAt;
      uint unstakeAt = unstakeRequest.unstakeAt;

      bool canUnstake = firstUnstakeRequestIndex > 0 && unstakeAt <= block.timestamp;
      bool canBurn = burnedAt != 0;
      bool canReward = firstReward != 0;

      if (!canBurn && !canUnstake && !canReward) {
        // everything is processed
        break;
      }

      if (
        canBurn &&
        (!canUnstake || burnedAt < unstakeAt) &&
        (!canReward || burnedAt < rewardedAt)
      ) {

        (finished, iterationsLeft) = _processBurn(iterationsLeft);

        if (!finished) {
          emit PendingActionsProcessed(false);
          return (false, iterationsLeft);
        }

        continue;
      }

      if (
        canUnstake &&
        (!canReward || unstakeAt < rewardedAt)
      ) {

        // _processFirstUnstakeRequest is O(1) so we'll handle the iteration checks here
        if (iterationsLeft == 0) {
          emit PendingActionsProcessed(false);
          return (false, iterationsLeft);
        }

        _processFirstUnstakeRequest();
        --iterationsLeft;
        continue;
      }

      (finished, iterationsLeft) = _processFirstReward(iterationsLeft);

      if (!finished) {
        emit PendingActionsProcessed(false);
        return (false, iterationsLeft);
      }
    }

    // everything is processed!
    emit PendingActionsProcessed(true);
    return (true, iterationsLeft);
  }

  function _processBurn(uint maxIterations) internal returns (bool finished, uint iterationsLeft) {

    iterationsLeft = maxIterations;

    address _contractAddress = burn.contractAddress;
    uint _stakedOnContract;

    (_stakedOnContract, finished, iterationsLeft) = _calculateContractStake(_contractAddress, iterationsLeft);

    if (!finished) {
      return (false, iterationsLeft);
    }

    address[] storage _contractStakers = contractStakers[_contractAddress];
    uint _stakerCount = _contractStakers.length;

    uint _totalBurnAmount = burn.amount;
    uint _actualBurnAmount = contractBurned;

    if (_totalBurnAmount > _stakedOnContract) {
      _totalBurnAmount = _stakedOnContract;
    }

    for (uint i = processedToStakerIndex; i < _stakerCount; i++) {

      if (iterationsLeft == 0) {
        contractBurned = _actualBurnAmount;
        processedToStakerIndex = i;
        return (false, iterationsLeft);
      }

      --iterationsLeft;

      Staker storage staker = stakers[_contractStakers[i]];
      uint _stakerBurnAmount;
      uint _newStake;

      (_stakerBurnAmount, _newStake) = _burnStaker(staker, _contractAddress, _stakedOnContract, _totalBurnAmount);
      _actualBurnAmount = _actualBurnAmount + _stakerBurnAmount;

      if (_newStake != 0) {
        continue;
      }

      // if we got here, the stake is explicitly set to 0
      // the staker is removed from the contract stakers array
      // and we will add the staker back if he stakes again
      staker.isInContractStakers[_contractAddress] = false;
      _contractStakers[i] = _contractStakers[_stakerCount - 1];
      _contractStakers.pop();

      // i-- might underflow to MAX_UINT
      // but that's fine since it will be incremented back to 0 on the next loop
      i--;
      _stakerCount--;
    }

    delete burn;
    contractBurned = 0;
    processedToStakerIndex = 0;
    isContractStakeCalculated = false;

    token.burn(_actualBurnAmount);
    emit Burned(_contractAddress, _actualBurnAmount, _stakedOnContract);

    return (true, iterationsLeft);
  }

  function _burnStaker(
    Staker storage staker, address _contractAddress, uint _stakedOnContract, uint _totalBurnAmount
  ) internal returns (
    uint _stakerBurnAmount, uint _newStake
  ) {

    uint _currentDeposit;
    uint _currentStake;

    // silence compiler warning
    _newStake = 0;

    // do we need a storage read?
    if (_stakedOnContract != 0) {
      _currentDeposit = staker.deposit;
      _currentStake = staker.stakes[_contractAddress];

      if (_currentStake > _currentDeposit) {
        _currentStake = _currentDeposit;
      }
    }

    if (_stakedOnContract != _totalBurnAmount) {
      // formula: staker_burn = staker_stake / total_contract_stake * contract_burn
      // reordered for precision loss prevention
      _stakerBurnAmount = _currentStake * _totalBurnAmount / _stakedOnContract;
      _newStake = _currentStake - _stakerBurnAmount;
    } else {
      // it's the whole stake
      _stakerBurnAmount = _currentStake;
    }

    if (_stakerBurnAmount != 0) {
      staker.deposit = _currentDeposit - _stakerBurnAmount;
    }

    staker.stakes[_contractAddress] = _newStake;
  }

  function _calculateContractStake(
    address _contractAddress, uint maxIterations
  ) internal returns (
    uint _stakedOnContract, bool finished, uint iterationsLeft
  ) {

    iterationsLeft = maxIterations;

    if (isContractStakeCalculated) {
      // use previously calculated staked amount
      return (contractStaked, true, iterationsLeft);
    }

    address[] storage _contractStakers = contractStakers[_contractAddress];
    uint _stakerCount = _contractStakers.length;
    uint startIndex = processedToStakerIndex;

    if (startIndex != 0) {
      _stakedOnContract = contractStaked;
    }

    // calculate amount staked on contract
    for (uint i = startIndex; i < _stakerCount; i++) {

      if (iterationsLeft == 0) {
        processedToStakerIndex = i;
        contractStaked = _stakedOnContract;
        return (_stakedOnContract, false, iterationsLeft);
      }

      --iterationsLeft;

      Staker storage staker = stakers[_contractStakers[i]];
      uint deposit = staker.deposit;
      uint stake = staker.stakes[_contractAddress];
      stake = deposit < stake ? deposit : stake;
      _stakedOnContract = _stakedOnContract + stake;
    }

    contractStaked = _stakedOnContract;
    isContractStakeCalculated = true;
    processedToStakerIndex = 0;

    return (_stakedOnContract, true, iterationsLeft);
  }

  function _processFirstUnstakeRequest() internal {

    uint firstRequest = unstakeRequests[0].next;
    UnstakeRequest storage unstakeRequest = unstakeRequests[firstRequest];
    address stakerAddress = unstakeRequest.stakerAddress;
    Staker storage staker = stakers[stakerAddress];

    address contractAddress = unstakeRequest.contractAddress;
    uint deposit = staker.deposit;
    uint initialStake = staker.stakes[contractAddress];
    uint stake = deposit < initialStake ? deposit : initialStake;

    uint requestedAmount = unstakeRequest.amount;
    uint actualUnstakedAmount = stake < requestedAmount ? stake : requestedAmount;
    staker.stakes[contractAddress] = stake - actualUnstakedAmount;

    uint pendingUnstakeRequestsTotal = staker.pendingUnstakeRequestsTotal[contractAddress];
    staker.pendingUnstakeRequestsTotal[contractAddress] = pendingUnstakeRequestsTotal - requestedAmount;

    // update pointer to first unstake request
    unstakeRequests[0].next = unstakeRequest.next;
    delete unstakeRequests[firstRequest];

    emit Unstaked(contractAddress, stakerAddress, requestedAmount);
  }

  function _processFirstReward(uint maxIterations) internal returns (bool finished, uint iterationsLeft) {

    iterationsLeft = maxIterations;

    Reward storage reward = rewards[firstReward];
    address _contractAddress = reward.contractAddress;
    uint _totalRewardAmount = reward.amount;

    uint _stakedOnContract;

    (_stakedOnContract, finished, iterationsLeft) = _calculateContractStake(_contractAddress, iterationsLeft);

    if (!finished) {
      return (false, iterationsLeft);
    }

    address[] storage _contractStakers = contractStakers[_contractAddress];
    uint _stakerCount = _contractStakers.length;
    uint _actualRewardAmount = contractRewarded;

    for (uint i = processedToStakerIndex; i < _stakerCount; i++) {

      if (iterationsLeft == 0) {
        contractRewarded = _actualRewardAmount;
        processedToStakerIndex = i;
        return (false, iterationsLeft);
      }

      --iterationsLeft;

      address _stakerAddress = _contractStakers[i];

      (uint _stakerRewardAmount, uint _stake) = _rewardStaker(
        _stakerAddress, _contractAddress, _totalRewardAmount, _stakedOnContract
      );

      // remove 0-amount stakers, similar to what we're doing when processing burns
      if (_stake == 0) {

        // mark the user as not present in contract stakers array
        Staker storage staker = stakers[_stakerAddress];
        staker.isInContractStakers[_contractAddress] = false;

        // remove the staker from the contract stakers array
        _contractStakers[i] = _contractStakers[_stakerCount - 1];
        _contractStakers.pop();
        i--;
        _stakerCount--;

        // since the stake is 0, there's no reward to give
        continue;
      }

      _actualRewardAmount = _actualRewardAmount + _stakerRewardAmount;
    }

    delete rewards[firstReward];
    contractRewarded = 0;
    processedToStakerIndex = 0;
    isContractStakeCalculated = false;

    if (++firstReward > lastRewardId) {
      firstReward = 0;
    }

    tokenController.mint(address(this), _actualRewardAmount);
    emit Rewarded(_contractAddress, _actualRewardAmount, _stakedOnContract);

    return (true, iterationsLeft);
  }

  function _rewardStaker(
    address stakerAddress, address contractAddress, uint totalRewardAmount, uint totalStakedOnContract
  ) internal returns (uint rewardedAmount, uint stake) {

    Staker storage staker = stakers[stakerAddress];
    uint deposit = staker.deposit;
    stake = staker.stakes[contractAddress];

    if (stake > deposit) {
      stake = deposit;
    }

    // prevent division by zero and set stake to zero
    if (totalStakedOnContract == 0 || stake == 0) {
      staker.stakes[contractAddress] = 0;
      return (0, 0);
    }

    // reward = staker_stake / total_contract_stake * total_reward
    rewardedAmount = totalRewardAmount * stake / totalStakedOnContract;
    staker.reward = staker.reward + rewardedAmount;
  }

  function updateUintParameters(bytes8 code, uint value) external {
    /* noop */
  }

  function initialize() public {
    require(!initialized, "Contract is already initialized");
    tokenController.addToWhitelist(address(this));
    initialized = true;
  }

  function changeDependentContractAddress() public {

    token = INXMToken(master.tokenAddress());
    tokenController = ITokenController(master.getLatestAddress("TC"));

    if (!initialized) {
      initialize();
    }
  }

  function migrateToNewV2Pool(address stakerAddress) external {
    // Addresses marked for implicit migration can be migrated by anyone.
    // Addresses who are not can only be migrated by calling this function themselves.
    // [todo] Add the marked addresses before deploy
    require(
      stakerAddress == msg.sender ||
      stakerAddress == 0x0000000000000000000000000000000000000001 ||
      stakerAddress == 0x0000000000000000000000000000000000000002, // etc.
      "You are not authorized to migrate this staker"
    );


    uint contractsCount = stakers[stakerAddress].contracts.length;
    uint deposit = stakers[stakerAddress].deposit;

    uint[] memory weights = new uint[](contractsCount);
    uint[] memory products = new uint[](contractsCount);
    for (uint i = 0; i < contractsCount; i++) {
      address oldProductId = stakers[stakerAddress].contracts[i];
      uint productId = productsV1.getNewProductId(oldProductId);
      products[i] = productId;
      uint stake = stakers[stakerAddress].stakes[oldProductId];
      weights[i] = stake * 1e18 / deposit;
    }

    // IStakingPool stakingPool = IStakingPool(cover.createStakingPool(stakerAddress));

    // [todo] Add the corresponding calls after a IStakingPool is available
    // uint stakingPositionNFT = stakingPool.deposit(deposit);
    // stakingPool.stakeAllocation(products, weights);

    stakers[stakerAddress].deposit = 0;

    revert("Not implemented");
  }

  function migrateToExistingV2Pool(IStakingPool stakingPool) external {
    uint deposit = stakers[msg.sender].deposit;
    // [todo] Add the corresponding calls after a IStakingPool is available
    // uint stakingPositionNFT = stakingPool.deposit(deposit);
    deposit;
    stakingPool;
    stakers[msg.sender].deposit = 0;
  }

}
