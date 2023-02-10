// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/IStakingPool.sol";

contract LegacyPooledStaking is IPooledStaking, MasterAwareV2 {
  /* Constants */

  address constant ARMOR_STAKER = 0x1337DEF1FC06783D4b03CB8C1Bf3EBf7D0593FC4;
  address constant ARMOR_MANAGER = 0xFa760444A229e78A50Ca9b3779f4ce4CcE10E170;
  address constant HUGH = 0x87B2a7559d85f4653f13E6546A14189cd5455d45;
  address constant NM_FOUNDATION = 0x963Df0066ff8345922dF88eebeb1095BE4e4e12E;
  uint constant MAX_ACTIVE_TRANCHES = 8;

  ICover public immutable cover;
  IProductsV1 public immutable productsV1;

  /* Structs */

  struct StakingPoolMigrationData {
    address stakerAddress;
    address managerAddress;
    string ipfsDescriptionHash;
    bool isPrivatePool;
    uint initialPoolFee;
    uint maxPoolFee;
    uint deposit;
    uint[MAX_ACTIVE_TRANCHES] trancheStakeRatio;
  }

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

  // used for logging products not listed in ProductsV1.sol when migrating to a new pool
  event ProductNotFound(address oldProductId);

  /* Storage variables */

  /*
    Deleted storage variables
    bool public initialized;
    INXMToken public token;

    These 2 variables occupied 1 slot. The MasterAwareV2 interface has 1 extra slot more
    compared to MasterAware. MasterAware.master storage variable is now overwriting initialized and token.
  */

  // was tokenController
  address internal _unused0;

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

  function stakerContractStake(address staker, address contractAddress) public override view returns (uint) {
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

  /// Used to
  function blockV1() external {
    v1Blocked = true;
  }

  function depositAndStake(
    uint amount,
    address[] calldata _contracts,
    uint[] calldata _stakes
  ) external whenNotPaused onlyMember noPendingActions {
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
    tokenController().operatorTransfer(msg.sender, address(this), amount);

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

  function withdraw(uint /*ignoredParam*/) external override whenNotPaused onlyMember noPendingBurns {
    _withdrawForUser(msg.sender);
  }

  function withdrawForUser(address user) external override whenNotPaused onlyMember noPendingBurns {
    _withdrawForUser(user);
  }

  function _withdrawForUser(address user) internal {

    // Stakers scheduled for automatic migration are not allowed to withdraw
    require(
      user != ARMOR_STAKER &&
      user != HUGH &&
      user != NM_FOUNDATION,
      "Not allowed to withdraw"
    );

    uint amount = stakers[user].deposit;
    stakers[user].deposit = 0;
    token().transfer(user, amount);
    emit Withdrawn(user, amount);
  }

  function requestUnstake(
    address[] calldata _contracts,
    uint[] calldata _amounts,
    uint _insertAfter // unstake request id after which the new unstake request will be inserted
  ) external whenNotPaused onlyMember {
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

  function withdrawReward(address stakerAddress) external override whenNotPaused {

    uint amount = stakers[stakerAddress].reward;
    stakers[stakerAddress].reward = 0;

    token().transfer(stakerAddress, amount);

    emit RewardWithdrawn(stakerAddress, amount);
  }

  function pushBurn(
    address contractAddress, uint amount
  ) public override onlyInternal whenNotPaused noPendingBurns {

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
  function pushRewards(address[] calldata contractAddresses) external whenNotPaused {
    _pushRewards(contractAddresses, false);
  }

  /**
   * @dev Add reward for contract. Automatically triggers distribution if enough time has passed.
   */
  function accumulateReward(address contractAddress, uint amount) external override onlyInternal whenNotPaused {

    // will push rewards if needed
    address[] memory contractAddresses = new address[](1);
    contractAddresses[0] = contractAddress;
    _pushRewards(contractAddresses, false);

    ContractReward storage contractRewards = accumulatedRewards[contractAddress];
    contractRewards.amount = contractRewards.amount + amount;
    emit RewardAdded(contractAddress, amount);
  }

  function processPendingActions(uint maxIterations) public override whenNotPaused returns (bool finished) {
    (finished,) = _processPendingActions(maxIterations);
  }

  function processPendingActionsReturnLeft(uint maxIterations) public whenNotPaused returns (bool finished, uint iterationsLeft) {
    (finished, iterationsLeft) = _processPendingActions(maxIterations);
  }

  function _processPendingActions(uint maxIterations) public whenNotPaused returns (bool finished, uint iterationsLeft) {

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
        i++;
        continue;
      }

      // if we got here, the stake is explicitly set to 0
      // the staker is removed from the contract stakers array
      // and we will add the staker back if he stakes again
      staker.isInContractStakers[_contractAddress] = false;
      _contractStakers[i] = _contractStakers[_stakerCount - 1];
      _contractStakers.pop();

      _stakerCount--;
    }

    delete burn;
    contractBurned = 0;
    processedToStakerIndex = 0;
    isContractStakeCalculated = false;

    token().burn(_actualBurnAmount);
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

    tokenController().mint(address(this), _actualRewardAmount);
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

  function token() internal view returns (INXMToken) {
    return INXMToken(internalContracts[uint(ID.TK)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function changeDependentContractAddress() public {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.TK)] = payable(master.tokenAddress());
  }

  function getV1PriceForProduct(uint id) pure public returns (uint96) {
    // {V1_PRICES_HELPER_BEGIN}
    if (
      // 0xC57d000000000000000000000000000000000007
      id == 28 ||
      // 0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce
      id == 34 ||
      // 0x0000000000000000000000000000000000000016
      id == 46 ||
      // 0xfdA462548Ce04282f4B6D6619823a7C64Fdc0185
      id == 49 ||
      // 0x0000000000000000000000000000000000000019
      id == 53 ||
      // 0x3D6bA331e3D9702C5e8A8d254e5d8a285F223aba
      id == 61 ||
      // 0x0000000000000000000000000000000000000030
      id == 63
    ) {
      return 0; // 0%
    }

    // 0xB1dD690Cc9AF7BB1a906A9B5A94F94191cc553Ce
    if (id == 0) {
      return 166840371999245618; // 16.684037199924564%
    }

    if (
      // 0x364508A5cA0538d8119D3BF40A284635686C98c4
      id == 1 ||
      // 0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B
      id == 3 ||
      // 0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F
      id == 4 ||
      // 0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B
      id == 5 ||
      // 0x9D25057e62939D3408406975aD75Ffe834DA4cDd
      id == 7 ||
      // 0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27
      id == 8 ||
      // 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f
      id == 10 ||
      // 0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F
      id == 12 ||
      // 0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9
      id == 14 ||
      // 0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd
      id == 15 ||
      // 0xCC88a9d330da1133Df3A7bD823B95e52511A6962
      id == 19 ||
      // 0xB17640796e4c27a39AF51887aff3F8DC0daF9567
      id == 21 ||
      // 0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2
      id == 22 ||
      // 0x1F98431c8aD98523631AE4a59f267346ea31F984
      id == 23 ||
      // 0xF403C135812408BFbE8713b5A23a04b3D48AAE31
      id == 24 ||
      // 0xBA12222222228d8Ba445958a75a0704d566BF2C8
      id == 25 ||
      // 0x0000000000000000000000000000000000000014
      id == 40 ||
      // 0x25751853Eab4D0eB3652B5eB6ecB102A2789644B
      id == 43 ||
      // 0x60aE616a2155Ee3d9A68541Ba4544862310933d4
      id == 45 ||
      // 0x453D4Ba9a2D594314DF88564248497F7D74d6b2C
      id == 48 ||
      // 0x0000000000000000000000000000000000000017
      id == 50 ||
      // 0x5C6374a2ac4EBC38DeA0Fc1F8716e5Ea1AdD94dd
      id == 51 ||
      // 0x0000000000000000000000000000000000000018
      id == 52 ||
      // 0x0000000000000000000000000000000000000021
      id == 54 ||
      // 0x0000000000000000000000000000000000000023
      id == 56 ||
      // 0x0000000000000000000000000000000000000027
      id == 59 ||
      // 0x0000000000000000000000000000000000000028
      id == 60 ||
      // 0x0000000000000000000000000000000000000031
      id == 64 ||
      // 0x0000000000000000000000000000000000000032
      id == 65
    ) {
      return 25982203969883641; // 2.598220396988364%
    }

    // 0xB27F1DB0a7e473304A5a06E54bdf035F671400C0
    if (id == 2) {
      return 208752392285254266; // 20.875239228525427%
    }

    // 0x11111254369792b2Ca5d084aB5eEA397cA8fa48B
    if (id == 6) {
      return 121853143122007643; // 12.185314312200765%
    }

    // 0x5B67871C3a857dE81A1ca0f9F7945e5670D986Dc
    if (id == 9) {
      return 272373013086269697; // 27.237301308626968%
    }

    // 0xAFcE80b19A8cE13DEc0739a1aaB7A028d6845Eb3
    if (id == 11) {
      return 50577575631374388; // 5.0577575631374385%
    }

    // 0xa4c8d221d8BB851f83aadd0223a8900A6921A349
    if (id == 13) {
      return 55271334203285110; // 5.527133420328512%
    }

    // 0xA51156F3F1e39d1036Ca4ba4974107A1C1815d1e
    if (id == 16) {
      return 364811737844859504; // 36.481173784485954%
    }

    // 0x6354E79F21B56C11f48bcD7c451BE456D7102A36
    if (id == 17) {
      return 163776374647389082; // 16.37763746473891%
    }

    // 0x7C06792Af1632E77cb27a558Dc0885338F4Bdf8E
    if (id == 18) {
      return 310893684739492349; // 31.089368473949236%
    }

    // 0xa4F1671d3Aee73C05b552d57f2d16d3cfcBd0217
    if (id == 20) {
      return 263310549969382575; // 26.331054996938256%
    }

    // 0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822
    if (id == 27) {
      return 90972034511800343; // 9.097203451180034%
    }

    // 0xc57D000000000000000000000000000000000008
    if (id == 29) {
      return 26185288868060925; // 2.6185288868060925%
    }

    // 0xc57d000000000000000000000000000000000009
    if (id == 30) {
      return 29417824657647349; // 2.9417824657647347%
    }

    // 0xefa94DE7a4656D787667C749f7E1223D71E9FD88
    if (id == 32) {
      return 611783591118218617; // 61.17835911182186%
    }

    // 0x0CED6166873038Ac0cc688e7E6d19E2cBE251Bf0
    if (id == 33) {
      return 117922675032764675; // 11.792267503276467%
    }

    // 0x48D49466CB2EFbF05FaA5fa5E69f2984eDC8d1D7
    if (id == 35) {
      return 309951100940035559; // 30.995110094003557%
    }

    // 0x0000000000000000000000000000000000000009
    if (id == 37) {
      return 26151420779828695; // 2.6151420779828696%
    }

    // 0x0000000000000000000000000000000000000010
    if (id == 38) {
      return 35457040045082062; // 3.5457040045082064%
    }

    // 0x0000000000000000000000000000000000000013
    if (id == 39) {
      return 167474162950791293; // 16.74741629507913%
    }

    // 0x1344A36A1B56144C3Bc62E7757377D288fDE0369
    if (id == 41) {
      return 146647698432175009; // 14.6647698432175%
    }

    // 0xd89a09084555a7D0ABe7B111b1f78DFEdDd638Be
    if (id == 44) {
      return 230575652047053513; // 23.05756520470535%
    }

    // 0x0000000000000000000000000000000000000022
    if (id == 55) {
      return 530432029078597846; // 53.04320290785978%
    }

    // 0x0000000000000000000000000000000000000025
    if (id == 57) {
      return 20985626283367556; // 2.0985626283367558%
    }

    // 0x0000000000000000000000000000000000000026
    if (id == 58) {
      return 22984257357973990; // 2.2984257357973994%
    }

    // 0x0000000000000000000000000000000000000029
    if (id == 62) {
      return 19986310746064339; // 1.998631074606434%
    }

    // 0x0000000000000000000000000000000000000033
    if (id == 66) {
      return 22484599589322381; // 2.248459958932238%
    }
    // {V1_PRICES_HELPER_END}

    return type(uint96).max;
  }

  function getProductInitParams(address stakerAddress, uint deposit) public view returns (
    ProductInitializationParams[] memory productInitParams
  ) {
    uint stakedProductsCount = stakers[stakerAddress].contracts.length;
    uint[] memory products = new uint[](stakedProductsCount);
    uint[] memory stakes = new uint[](stakedProductsCount);

    uint productsToBeMigratedCount = 0;

    for (uint i = 0; i < stakedProductsCount; i++) {
      address productAddress = stakers[stakerAddress].contracts[i];

      uint productId;
      try productsV1.getNewProductId(productAddress) returns (uint id) {
        productId = id;
      } catch {
        continue;
      }

      products[i] = productId;
      stakes[i] = stakerContractStake(stakerAddress, productAddress);
      productsToBeMigratedCount++;
    }

    productInitParams = new ProductInitializationParams[](productsToBeMigratedCount);

    uint index = 0;
    for (uint i = 0; i < stakedProductsCount; i++) {
      if (stakes[i] == 0) {
        continue;
      }

      uint96 price = getV1PriceForProduct(products[i]);
      if (price == type(uint96).max) {
        continue;
      }

      productInitParams[index] = ProductInitializationParams(
        products[i], // productId
        uint8(stakes[i] * 1e18 / deposit / 1e16), // weight (0-100)
        price / 1e16, // initialPrice with a 100_00 denominator
        price / 1e16 // targetPrice with a 100_00 denominator
      );
      index++;
    }
  }

  function migrateToPool(
    StakingPoolMigrationData memory migrationData,
    ProductInitializationParams[] memory productInitParams
  ) internal {
    ( /* uint stakingPoolId */, address stakingPoolAddress) = cover.createStakingPool(
      migrationData.managerAddress,
      migrationData.isPrivatePool,
      migrationData.initialPoolFee,
      migrationData.maxPoolFee,
      productInitParams,
      migrationData.ipfsDescriptionHash
    );

    token().approve(address(tokenController()), migrationData.deposit);

    uint totalStakeRatio = 0;
    uint totalStake = 0;
    uint tokenId = 0; // 0 means a new NFT will be created that will then be reused for each tranche
    uint firstTrancheId = block.timestamp / 91 days + 1;

    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
      uint trancheDeposit = migrationData.deposit * migrationData.trancheStakeRatio[i] / 100;
      if (trancheDeposit == 0) {
        continue;
      }

      totalStakeRatio += migrationData.trancheStakeRatio[i];
      // Prevent dust due to precision loss and deposit everything remaining in the last tranche
      if (totalStakeRatio == 100) {
        trancheDeposit = migrationData.deposit - totalStake;
      }
      totalStake += trancheDeposit;

      tokenId = IStakingPool(stakingPoolAddress).depositTo(
        trancheDeposit,
        firstTrancheId + i,
        tokenId,
        migrationData.managerAddress
      );
    }

    // TODO This can be enabled once the foundation deposit migration is done
    // require(totalStake == migrationData.deposit, "Migrated stake != staker deposit");
  }

  function migrateToNewV2Pool(address stakerAddress) external noPendingActions {
    // Only selected stakers are automatically migrated
    require(
      stakerAddress == ARMOR_STAKER ||
      stakerAddress == HUGH ||
      stakerAddress == NM_FOUNDATION,

      "You are not authorized to migrate this staker"
    );

    uint deposit = stakers[stakerAddress].deposit;
    require(deposit > 0, "Address has no stake to migrate");

    INXMToken nxm = token();
    uint nxmBalanceBefore = nxm.balanceOf(address(this));

    ProductInitializationParams[] memory productInitParams = getProductInitParams(
      stakerAddress,
      deposit
    );

    if (stakerAddress == HUGH) {
      migrateToPool(
        StakingPoolMigrationData(
          HUGH, // stakerAddress
          HUGH, // managerAddress
          '', // ipfsDescriptionHash --- TODO fill in
          false, // isPrivatePool
          10, // initialPoolFee
          20, // maxPoolFee
          deposit, // deposit
          [uint256(0), 10, 0, 0, 0, 90, 0, 0] // stake on each tranche, as % out of the deposit
        ),
        productInitParams
      );
    } else if (stakerAddress == ARMOR_STAKER) {

      uint armorAAALowRiskPoolDeposit = 75 * deposit / 100;
      migrateToPool(
        StakingPoolMigrationData(
          ARMOR_STAKER, // stakerAddress
          ARMOR_MANAGER, // managerAddress
          '', // ipfsDescriptionHash --- TODO fill in
          false, // isPrivatePool
          15, // initialPoolFee
          25, // maxPoolFee
          armorAAALowRiskPoolDeposit, // deposit
          [uint256(20), 25, 25, 15, 10, 0, 0, 0] // stake on each tranche, as % out of the deposit
        ),
        productInitParams
      );

      uint armorAAMidRiskPoolDeposit = deposit - armorAAALowRiskPoolDeposit;
      migrateToPool(
        StakingPoolMigrationData(
          ARMOR_STAKER, // stakerAddress
          ARMOR_MANAGER, // managerAddress
          '', // ipfsDescriptionHash --- TODO fill in
          false, // isPrivatePool
          15, // initialPoolFee
          25, // maxPoolFee
          armorAAMidRiskPoolDeposit, // deposit
          [uint256(20), 25, 25, 15, 10, 0, 0, 0] // stake on each tranche, as % out of the deposit
        ),
        productInitParams
      );
    } else if (stakerAddress == NM_FOUNDATION) {

      // TODO: when switching the StakingPool manager is supported, simply make LegacyPooledStaking the manager
      // make the deposits and then switch the manager to the foundation
      // trancheStakeRatio = [uint256(0), 25, 0, 25, 0, 50, 0, 0];
      migrateToPool(
        StakingPoolMigrationData(
          NM_FOUNDATION, // stakerAddress
          NM_FOUNDATION, // managerAddress
          '', // ipfsDescriptionHash --- TODO fill in
          true, // isPrivatePool
          0, // initialPoolFee
          99, // maxPoolFee
          deposit,
          [uint256(0), 0, 0, 0, 0, 0, 0, 0] // stake on each tranche, as % out of the deposit
        ),
        productInitParams
      );
    } else {
      revert("Staker cannot be automatically migrated to a new staking pool");
    }

    uint nxmBalanceAfter = nxm.balanceOf(address(this));
    uint nxmToBeUnlocked = deposit - (nxmBalanceBefore - nxmBalanceAfter);

    // Set deposit to zero to avoid re-entrancy
    stakers[stakerAddress].deposit = 0;

    // Send unlocked NXM back
    nxm.transfer(stakerAddress, nxmToBeUnlocked);
  }

  // TODO review if we want this functionality
  // We might want to allow users to lock their deposit in multiple tranches
  function migrateToExistingV2Pool(IStakingPool stakingPool, uint trancheId) external {
    uint deposit = stakers[msg.sender].deposit;
    stakers[msg.sender].deposit = 0;
    token().approve(address(tokenController()), deposit);
    stakingPool.depositTo(deposit, trancheId, 0, msg.sender);
  }
}
