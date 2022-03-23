// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAware.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/IStakingPool.sol";
import "hardhat/console.sol";

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

  bool public v1Blocked;

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

  function min(uint x, uint y) pure internal returns (uint) {
    return x < y ? x : y;
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
  ) external whenNotPausedAndInitialized onlyMember noPendingActions {
    require(!v1Blocked, "Migrate to v2");

    Staker storage staker = stakers[msg.sender];
    uint oldLength = staker.contracts.length;

    require(
      _contracts.length >= oldLength,
      "Staking on fewer contracts is not allowed"
    );

    require(
      _contracts.length == _stakes.length,
      "Contracts and stakes arrays should have the same length"
    );

    uint totalStaked;

    // cap old stakes to this amount
    uint oldDeposit = staker.deposit;
    uint newDeposit = oldDeposit + amount;

    staker.deposit = newDeposit;
    tokenController.operatorTransfer(msg.sender, address(this), amount);

    for (uint i = 0; i < _contracts.length; i++) {

      address contractAddress = _contracts[i];

      for (uint j = 0; j < i; j++) {
        require(_contracts[j] != contractAddress, "Contracts array should not contain duplicates");
      }

      uint initialStake = staker.stakes[contractAddress];
      uint oldStake = oldDeposit < initialStake ? oldDeposit : initialStake;
      uint newStake = _stakes[i];
      bool isNewStake = i >= oldLength;

      if (!isNewStake) {
        require(contractAddress == staker.contracts[i], "Unexpected contract order");
        require(oldStake <= newStake, "New stake is less than previous stake");
      } else {
        require(newStake > 0, "New stakes should be greater than 0");
        staker.contracts.push(contractAddress);
      }

      if (oldStake == newStake) {

        // if there were burns but the stake was not updated, update it now
        if (initialStake != newStake) {
          staker.stakes[contractAddress] = newStake;
        }

        totalStaked = totalStaked + newStake;

        // no other changes to this contract
        continue;
      }

      require(newStake >= MIN_STAKE, "Minimum stake amount not met");
      require(newStake <= newDeposit, "Cannot stake more than deposited");

      if (isNewStake || !staker.isInContractStakers[contractAddress]) {
        staker.isInContractStakers[contractAddress] = true;
        contractStakers[contractAddress].push(msg.sender);
      }

      staker.stakes[contractAddress] = newStake;
      totalStaked = totalStaked + newStake;
      uint increase = newStake - oldStake;

      emit Staked(contractAddress, msg.sender, increase);
    }

    require(
      totalStaked <= staker.deposit * MAX_EXPOSURE,
      "Total stake exceeds maximum allowed"
    );

    if (amount > 0) {
      emit Deposited(msg.sender, amount);
    }

    // cleanup zero-amount contracts
    uint lastContractIndex = _contracts.length - 1;

    for (uint i = oldLength; i > 0; i--) {
      if (_stakes[i - 1] == 0) {
        staker.contracts[i - 1] = staker.contracts[lastContractIndex];
        staker.contracts.pop();
        --lastContractIndex;
      }
    }
  }

  function withdraw(uint ignoredParam) external override whenNotPausedAndInitialized onlyMember noPendingBurns {
    uint amount = stakers[msg.sender].deposit;
    stakers[msg.sender].deposit -= amount;
    token.transfer(msg.sender, amount);
    emit Withdrawn(msg.sender, amount);
  }

  function requestUnstake(
    address[] calldata _contracts,
    uint[] calldata _amounts,
    uint _insertAfter // unstake request id after which the new unstake request will be inserted
  ) external whenNotPausedAndInitialized onlyMember {
    require(!v1Blocked, "Migrate to v2");

    require(
      _contracts.length == _amounts.length,
      "Contracts and amounts arrays should have the same length"
    );

    require(_insertAfter <= lastUnstakeRequestId, "Invalid unstake request id provided");

    Staker storage staker = stakers[msg.sender];
    uint deposit = staker.deposit;
    uint previousId = _insertAfter;
    uint unstakeAt = block.timestamp + UNSTAKE_LOCK_TIME;

    UnstakeRequest storage previousRequest = unstakeRequests[previousId];

    // Forbid insertion after an empty slot when there are non-empty slots
    // previousId != 0 allows inserting on the first position (in case lock time has been reduced)
    if (previousId != 0) {
      require(previousRequest.unstakeAt != 0, "Provided unstake request id should not be an empty slot");
    }

    for (uint i = 0; i < _contracts.length; i++) {

      address contractAddress = _contracts[i];
      uint stake = staker.stakes[contractAddress];

      if (stake > deposit) {
        stake = deposit;
      }

      uint pendingUnstakeAmount = staker.pendingUnstakeRequestsTotal[contractAddress];
      uint requestedAmount = _amounts[i];
      uint max = pendingUnstakeAmount > stake ? 0 : stake - pendingUnstakeAmount;

      require(max > 0, "Nothing to unstake on this contract");
      require(requestedAmount <= max, "Cannot unstake more than staked");

      // To prevent spam, small stakes and unstake requests are not allowed
      // However, we allow the user to unstake the entire amount
      if (requestedAmount != max) {
        require(requestedAmount >= MIN_UNSTAKE, "Unstaked amount cannot be less than minimum unstake amount");
        require(max - requestedAmount >= MIN_STAKE, "Remaining stake cannot be less than minimum unstake amount");
      }

      require(
        unstakeAt >= previousRequest.unstakeAt,
        "Unstake request time must be greater or equal to previous unstake request"
      );

      if (previousRequest.next != 0) {
        UnstakeRequest storage nextRequest = unstakeRequests[previousRequest.next];
        require(
          nextRequest.unstakeAt > unstakeAt,
          "Next unstake request time must be greater than new unstake request time"
        );
      }

      // Note: We previously had an `id` variable that was assigned immediately to `previousId`.
      //   It was removed in order to save some memory and previousId used instead.
      //   This makes the next section slightly harder to read but you can read "previousId" as "newId" instead.

      // get next available unstake request id. our new unstake request becomes previous for the next loop
      previousId = ++lastUnstakeRequestId;

      unstakeRequests[previousId] = UnstakeRequest(
        requestedAmount,
        unstakeAt,
        contractAddress,
        msg.sender,
        previousRequest.next
      );

      // point to our new unstake request
      previousRequest.next = previousId;

      emit UnstakeRequested(contractAddress, msg.sender, requestedAmount, unstakeAt);

      // increase pending unstake requests total so we keep track of final stake
      uint newPending = staker.pendingUnstakeRequestsTotal[contractAddress] + requestedAmount;
      staker.pendingUnstakeRequestsTotal[contractAddress] = newPending;

      // update the reference to the unstake request at target index for the next loop
      previousRequest = unstakeRequests[previousId];
    }
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

    for (uint i = processedToStakerIndex; i < _stakerCount; ) {

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
        unchecked{i++;}
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
      //unchecked{i--;}
      _stakerCount--;
      //unchecked{i++;}
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

    for (uint i = processedToStakerIndex; i < _stakerCount;) {

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
        _stakerCount--;

        // since the stake is 0, there's no reward to give
        continue;
      }

      _actualRewardAmount = _actualRewardAmount + _stakerRewardAmount;
      i++;
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

  function updateUintParameters(bytes8 code, uint value) external onlyGovernance {
    if (code == "MIN_STAK") {
      MIN_STAKE = value;
      return;
    }

    if (code == "MAX_EXPO") {
      MAX_EXPOSURE = value;
      return;
    }

    if (code == "MIN_UNST") {
      MIN_UNSTAKE = value;
      return;
    }

    if (code == "UNST_LKT") {
      UNSTAKE_LOCK_TIME = value;
      return;
    }
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

  function migrateToNewV2Pool(address stakerAddress) external noPendingActions {
    // Addresses marked for implicit migration can be migrated by anyone.
    // Addresses who are not can only be migrated by calling this function themselves.
    // [todo] Check these addresses before deploy
    require(
      stakerAddress == msg.sender ||
      stakerAddress == 0x1337DEF1FC06783D4b03CB8C1Bf3EBf7D0593FC4 || // Armor 48%
      stakerAddress == 0x87B2a7559d85f4653f13E6546A14189cd5455d45 || // Hugh 16.3%
      stakerAddress == 0x4a9fA34da6d2378c8f3B9F6b83532B169beaEDFc || // 6.6%
      stakerAddress == 0x46de0C6F149BE3885f28e54bb4d302Cb2C505bC2 || // 4.5%
      stakerAddress == 0xE1Ad30971b83c17E2A24c0334CB45f808AbEBc87 || // 2.5%
      stakerAddress == 0x5FAdEA9d64FFbe0b8A6799B8f0c72250F92E2B1d || // 1.7%
      stakerAddress == 0x9c657DB2B697846BE13Ca0B2bB5a6D17f860a395 || // 1.5%
      stakerAddress == 0xF99b3a13d46A04735BF3828eB3030cfED5Ea0087 || // 1.4%
      stakerAddress == 0x8C878B8f805472C0b70eD66a71c0B33da3d233c8 || // 1.4%
      stakerAddress == 0x4544e2Fae244eA4Ca20d075bb760561Ce5990DC3, // 0.7%
      "You are not authorized to migrate this staker"
    );

    require(stakers[stakerAddress].deposit > 0, "Address has no migratable stake");
    console.log("Migrating staker %s", stakerAddress);

    uint contractsCount = stakers[stakerAddress].contracts.length;
    uint deposit = stakers[stakerAddress].deposit;

    uint[] memory products = new uint[](contractsCount);
    uint[] memory stakes = new uint[](contractsCount);
    uint migratableCount = 0;

    for (uint i = 0; i < contractsCount; i++) {
      address oldProductId = stakers[stakerAddress].contracts[i];
      uint productId;
      try productsV1.getNewProductId(oldProductId) returns (uint v) {
        productId = v;
      } catch {
        console.log("oldProductId %s not found in productsV1, likely deprecated", oldProductId);
        continue;
      }
      products[i] = productId;
      uint stake = stakers[stakerAddress].stakes[oldProductId];
      migratableCount++;
    }

    uint[] memory migratableProducts = new uint[](migratableCount);
    uint8[] memory weights = new uint8[](migratableCount);
    uint migrateAtIndex = 0;

    for (uint i = 0; i < contractsCount; i++) {
      if (stakes[i] == 0) {
        continue;
      }
      migratableProducts[migrateAtIndex] = products[i];
      weights[migrateAtIndex] = uint8(min(stakes[i] * 1e18 / deposit / 1e16, 100));
      migrateAtIndex++;
    }

    // IStakingPool stakingPool = IStakingPool(cover.createStakingPool(stakerAddress));
    revert("Not implemented");

    // [todo] Add the corresponding calls after a IStakingPool is available
    // uint stakingPositionNFT = stakingPool.deposit(deposit);
    // stakingPool.stakeAllocation(migratableProducts, weights);

    stakers[stakerAddress].deposit = 0;
  }

  function migrateToExistingV2Pool(IStakingPool stakingPool) external {
    uint deposit = stakers[msg.sender].deposit;
    // [todo] Add the corresponding calls after a IStakingPool is available
    // uint stakingPositionNFT = stakingPool.deposit(deposit);
    stakers[msg.sender].deposit = 0;
  }

}
