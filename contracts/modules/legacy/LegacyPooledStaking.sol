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
  /* Structs */

  struct MigrationData {
    address stakerAddress;
    string ipfsDescriptionHash;
    address managerAddress;
    bool isPrivatePool;
    uint initialPoolFee;
    uint maxPoolFee;

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

  /* constants */

  address constant ARMOR = 0x1337DEF1FC06783D4b03CB8C1Bf3EBf7D0593FC4;
  address constant ARMOR_MANAGER = 0xFa760444A229e78A50Ca9b3779f4ce4CcE10E170;
  address constant HUGH = 0x87B2a7559d85f4653f13E6546A14189cd5455d45;
  address constant NEXUS_FOUNDATION = 0x963Df0066ff8345922dF88eebeb1095BE4e4e12E;
  address constant ITRUST = 0x46de0C6F149BE3885f28e54bb4d302Cb2C505bC2;
  uint constant TRANCHE_COUNT = 8;

  ICover public immutable cover;
  IProductsV1 public immutable productsV1;

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
    uint amount = stakers[msg.sender].deposit;
    stakers[msg.sender].deposit = 0;
    token().transfer(msg.sender, amount);
    emit Withdrawn(msg.sender, amount);
  }

  function withdrawForUser(address user) external override whenNotPaused onlyMember noPendingBurns {
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

  function getV1PriceForProduct(uint id) view public returns (uint96) {
    // {V1_PRICES_HELPER_BEGIN}

    // Argent
    if (id == 18) {
      return 12432734161534590000; // 12.43273416153459%
    }

    if (
      // dydx Perpetual
      id == 21 ||
      // Compound v2
      id == 32 ||
      // Gnosis Safe
      id == 33 ||
      // MakerDAO MCD
      id == 35 ||
      // Yearn Finance (all vaults)
      id == 44 ||
      // Curve All Pools (incl staking)
      id == 49 ||
      // Uniswap v2
      id == 51 ||
      // Synthetix
      id == 58 ||
      // Eth 2.0 (deposit contract)
      id == 75 ||
      // Aave v2
      id == 81 ||
      // SushiSwap v1
      id == 82 ||
      // Reflexer
      id == 89 ||
      // Stake DAO
      id == 92 ||
      // Liquity
      id == 93 ||
      // Uniswap v3
      id == 95 ||
      // Convex Finance v1
      id == 97 ||
      // Balancer v2
      id == 100 ||
      // Coinbase
      id == 111 ||
      // Kraken
      id == 112 ||
      // Yearn yvUSDC v2
      id == 128 ||
      // Curve 3pool LP (3Crv)
      id == 130 ||
      // Convex 3CRV (cvx3CRV)
      id == 135 ||
      // Ribbon Finance v2
      id == 140 ||
      // Trader Joe
      id == 142 ||
      // Ondo
      id == 144 ||
      // Enzyme v3
      id == 145 ||
      // Beefy
      id == 146 ||
      // Angle
      id == 147 ||
      // FODL
      id == 149 ||
      // Alchemix v2
      id == 150 ||
      // Bundle: Gelt + mStable + Aave v2
      id == 151 ||
      // Yeti Finance
      id == 152 ||
      // Vector
      id == 154 ||
      // Ease
      id == 156 ||
      // Stakewise operated (3 ETH / validator)
      id == 158 ||
      // Stakewise 3rd party (3 ETH / validator)
      id == 159 ||
      // Nested
      id == 160 ||
      // Euler
      id == 161 ||
      // GMX
      id == 162 ||
      // Sherlock
      id == 163 ||
      // Gearbox V2
      id == 164 ||
      // Aura
      id == 165 ||
      // Enzyme v4
      id == 166
    ) {
      return 2600000000000000000; // 2.6%
    }

    // 0x v3
    if (id == 30) {
      return 19145488072252274000; // 19.145488072252274%
    }

    // 1Inch (DEX & Liquidity Pools)
    if (id == 41) {
      return 11615611571267385000; // 11.615611571267385%
    }

    // Set Protocol
    if (id == 50) {
      return 25776769897239860000; // 25.77676989723986%
    }

    // mStable
    if (id == 57) {
      return 3644413798025818000; // 3.644413798025818%
    }

    // UMA
    if (id == 62) {
      return 8201495783983267000; // 8.201495783983267%
    }

    // Idle v4
    if (id == 65) {
      return 36034804377271030000; // 36.03480437727103%
    }

    // Pool Together v3
    if (id == 72) {
      return 16217884130675326000; // 16.217884130675326%
    }

    // Set Protocol v2
    if (id == 73) {
      return 5369407919786518000; // 5.369407919786518%
    }

    // TrueFi
    if (id == 79) {
      return 28565302775823290000; // 28.56530277582329%
    }

    // Perpetual Protocol
    if (id == 84) {
      return 35119077526559266000; // 35.119077526559266%
    }

    // BadgerDAO
    if (id == 85) {
      return 14228404256362980000; // 14.22840425636298%
    }

    // Opyn v2
    if (id == 88) {
      return 31110662561945094000; // 31.11066256194509%
    }

    // Vesper
    if (id == 90) {
      return 23264163793413047000; // 23.264163793413047%
    }

    // Homora v2
    if (id == 99) {
      return 33704826520238470000; // 33.70482652023847%
    }

    // Alpaca Finance
    if (id == 101) {
      return 39144809221972060000; // 39.14480922197206%
    }

    // Goldfinch
    if (id == 103) {
      return 8374975213313965000; // 8.374975213313965%
    }

    // Binance
    if (id == 110) {
      return 4572366582545144000; // 4.572366582545143%
    }

    // FTX
    if (id == 114) {
      return 26716469402552790000; // 26.71646940255279%
    }

    // Pangolin
    if (id == 117) {
      return 45172738238869165000; // 45.172738238869165%
    }

    // Centrifuge Tinlake
    if (id == 118) {
      return 11182572081933671000; // 11.182572081933671%
    }

    // Abracadabra
    if (id == 120) {
      return 39776602220476825000; // 39.776602220476825%
    }

    // Premia Finance
    if (id == 121) {
      return 28641545311637937000; // 28.641545311637937%
    }

    // Yearn yvDAI v2
    if (id == 127) {
      return 2639172326859299000; // 2.639172326859299%
    }

    // Yearn ycrvstETH v2
    if (id == 129) {
      return 22245704685826860000; // 22.24570468582686%
    }

    // Curve sETH LP (eCrv)
    if (id == 131) {
      return 3337647342934265000; // 3.337647342934265%
    }

    // Idle DAI v4 (idleDAIYield)
    if (id == 132) {
      return 50925266656986310000; // 50.92526665698631%
    }

    // Idle USDT v4 (idleUSDTYield)
    if (id == 133) {
      return 55760635763374930000; // 55.760635763374935%
    }

    // Convex stethCrv (cvxstethCrv)
    if (id == 134) {
      return 16591126228633247000; // 16.591126228633247%
    }

    // Notional Finance v2
    if (id == 138) {
      return 14441080249369067000; // 14.441080249369067%
    }

    // OlympusDAO
    if (id == 139) {
      return 43265543057180246000; // 43.265543057180246%
    }

    // Pool Together v4
    if (id == 141) {
      return 23073358057585290000; // 23.073358057585292%
    }

    // Origin OUSD
    if (id == 143) {
      return 83061669760667070000; // 83.06166976066707%
    }

    // Platypus
    if (id == 148) {
      return 5959850680712226500; // 5.9598506807122265%
    }

    // Bancor v3
    if (id == 155) {
      return 50959912909288030000; // 50.95991290928803%
    }

    // Iron Bank
    if (id == 157) {
      return 62666829169994260000; // 62.66682916999426%
    }
    // {V1_PRICES_HELPER_END}

    return type(uint96).max;
  }

  function getStakerConfig(address stakerAddress) internal returns (
    ProductInitializationParams[] memory params,
    uint deposit
  ) {

    // read and set deposit to zero to avoid re-entrancy
    deposit = stakers[stakerAddress].deposit;
    require(deposit > 0, "Address has no stake to migrate");
    stakers[stakerAddress].deposit = 0;

    uint contractCount = stakers[stakerAddress].contracts.length;
    uint[] memory products = new uint[](contractCount);
    uint[] memory stakes = new uint[](contractCount);
    uint migratableCount = 0;

    for (uint i = 0; i < contractCount; i++) {
      address oldProductId = stakers[stakerAddress].contracts[i];
      uint productId;
      try productsV1.getNewProductId(oldProductId) returns (uint v) {
        productId = v;
      } catch {
        emit ProductNotFound(oldProductId);
        continue;
      }
      products[i] = productId;
      stakes[i] = min(stakers[stakerAddress].stakes[oldProductId], deposit);
      migratableCount++;
    }

    params = new ProductInitializationParams[](migratableCount);
    uint migrateAtIndex = 0;


    for (uint i = 0; i < contractCount; i++) {
      if (stakes[i] == 0) {
        continue;
      }
      uint96 price = getV1PriceForProduct(products[i]);
      if (price == type(uint96).max) {
        continue;
      }
      params[migrateAtIndex] = ProductInitializationParams(
        products[i], // productId
        uint8(min(stakes[i] * 1e18 / deposit / 1e16, 100)), // weight (0-100)
        price / 1e16, // initialPrice with a 100_00 denominator
        price / 1e16 // targetPrice with a 100_00 denominator
      );
      migrateAtIndex++;
    }
  }


  struct StakingPoolMigrationData {
    uint initialPoolFee;
    uint maxPoolFee;
    uint[TRANCHE_COUNT] stakerTrancheRatios;
    uint deposit;
    address stakerAddress;
    bool isPrivatePool;
    string ipfsDescriptionHash;
    address managerAddress;
  }

  function migrateToNewV2Pool(address stakerAddress) external noPendingActions {

    // Addresses marked for implicit migration can be migrated by anyone.
    // Addresses who are not can only be migrated by calling this function themselves.
    require(
      stakerAddress == ARMOR || // Armor
      stakerAddress == HUGH || // Hugh
      stakerAddress == NEXUS_FOUNDATION, // Foundation

      "You are not authorized to migrate this staker"
    );


    INXMToken nxm = token();
    uint nxmBalanceBefore = nxm.balanceOf(address(this));

    // ratios have no decimal points. eg 5 is 5%
    uint[TRANCHE_COUNT] memory stakerTrancheRatios;

    (ProductInitializationParams[] memory params, uint deposit) = getStakerConfig(stakerAddress);

    if (stakerAddress == HUGH) {
      stakerTrancheRatios = [uint256(0), 10, 0, 0, 0, 90, 0, 0];

      migrateToPool(
        StakingPoolMigrationData(
         10, // initialPoolFee
         20, // maxPoolFee
         stakerTrancheRatios,
         deposit,
         HUGH,
         false, // isPrivatePool
         '', // ipfsDescriptionHash
         HUGH // managerAddress
        ),
        params
      );
    } else if (stakerAddress == ARMOR) {
      stakerTrancheRatios = [uint256(20), 25, 25, 15, 10, 0, 0, 0];

      uint aaaLowRiskPoolDeposit = 75 * deposit / 100;
      uint maxFee = 25;
      uint initialFee = 15;
      migrateToPool(
        StakingPoolMigrationData(
          initialFee,
          maxFee,
          stakerTrancheRatios,
          aaaLowRiskPoolDeposit,
          ARMOR,
          false, // isPrivatePool
          '', // ipfsDescriptionHash
          ARMOR_MANAGER // managerAddress
        ),
        params
      );
      uint aaRiskPoolDeposit = deposit - aaaLowRiskPoolDeposit;

      migrateToPool(
        StakingPoolMigrationData(
          initialFee,
          maxFee,
          stakerTrancheRatios,
          aaRiskPoolDeposit,
          ARMOR,
          false, // isPrivatePool
          '', // ipfsDescriptionHash
          ARMOR_MANAGER // managerAddress
        ),
        params
      );

    } else if (stakerAddress == NEXUS_FOUNDATION) {

      stakerTrancheRatios = [uint256(0), 0, 0, 0, 0, 0, 0, 0];
      // TODO: when switching the StakingPool manager is supported, simply make LegacyPooledStaking the manager
      // make the deposits and then switch the manager to the foundation
      // stakerTrancheRatios = [uint256(0), 25, 0, 25, 0, 50, 0, 0];

      // TODO: waiting for final value for maxPoolFee
      migrateToPool(
        StakingPoolMigrationData(
          0, // initialPoolFee
          20, // maxPoolFee
          stakerTrancheRatios,
          deposit,
          NEXUS_FOUNDATION,
          true, // isPrivatePool
          '', // ipfsDescriptionHash
          NEXUS_FOUNDATION // managerAddress
        ),
        params
      );
    } else {
      revert("Usupported migrateable staker");
    }

    uint nxmBalanceAfter = nxm.balanceOf(address(this));

    uint nexusV2StakedNXM = nxmBalanceBefore - nxmBalanceAfter;

    uint nxmToBeUnlocked = deposit - nexusV2StakedNXM;

    // send unlocked back
    nxm.transfer(stakerAddress, nxmToBeUnlocked);
  }


  function migrateToPool(
    StakingPoolMigrationData memory migrationData,
    ProductInitializationParams[] memory params
  ) internal {
    ( /* uint stakingPoolId */, address stakingPoolAddress) = cover.createStakingPool(
      migrationData.stakerAddress,
      migrationData.isPrivatePool,
      migrationData.initialPoolFee,
      migrationData.maxPoolFee,
      params,
      migrationData.ipfsDescriptionHash
    );

    uint firstTrancheId = block.timestamp / 91 days + 1;
    for (uint i = 0; i < TRANCHE_COUNT; i++) {
      uint trancheDeposit = migrationData.deposit * migrationData.stakerTrancheRatios[i] / 100;

      if (trancheDeposit == 0) {
        continue;
      }

      token().approve(address(tokenController()), trancheDeposit);
      IStakingPool(stakingPoolAddress).depositTo(
        trancheDeposit,
        firstTrancheId + i,
        type(uint).max,
        migrationData.managerAddress
      );
    }
  }

  function migrateToExistingV2Pool(IStakingPool stakingPool, uint trancheId) external {
    uint deposit = stakers[msg.sender].deposit;
    stakers[msg.sender].deposit = 0;
    token().approve(address(tokenController()), deposit);
    stakingPool.depositTo(deposit, trancheId, 0, msg.sender);
  }
}