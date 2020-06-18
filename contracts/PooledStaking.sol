/*
    Copyright (C) 2020 NexusMutual.io

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/
*/

pragma solidity ^0.5.7;

import "./abstract/MasterAware.sol";
import "./interfaces/IPooledStaking.sol";
import "./NXMToken.sol";
import "./TokenController.sol";
import "./MemberRoles.sol";
import "./TokenFunctions.sol";
import "./TokenData.sol";
import "./ClaimsReward.sol";
import "./external/openzeppelin-solidity/math/SafeMath.sol";

contract PooledStaking is MasterAware, IPooledStaking {
  using SafeMath for uint;

  /* Data types */

  struct Staker {
    uint deposit; // total amount of deposit nxm
    uint reward; // total amount that is ready to be claimed
    address[] contracts; // list of contracts the staker has staked on

    // staked amounts for each contract
    mapping(address => uint) stakes;

    // amount pending to be subtracted after all unstake requests will be processed
    mapping(address => uint) pendingUnstakeRequestsTotal;

    // flag to indicate the presence of this staker in the array of stakers of each contract
    mapping(address => bool) isInContractStakers;
  }

  struct Burn {
    uint amount;
    uint burnedAt;
    address contractAddress;
  }

  struct Reward {
    uint amount;
    uint rewardedAt;
    address contractAddress;
  }

  struct UnstakeRequest {
    uint amount;
    uint unstakeAt;
    address contractAddress;
    address stakerAddress;
    uint next; // id of the next unstake request in the linked list
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
  event Burned(address indexed contractAddress, uint amount);

  // rewards
  event RewardRequested(address indexed contractAddress, uint amount);
  event Rewarded(address indexed contractAddress, uint amount);
  event RewardWithdrawn(address indexed staker, uint amount);

  // pending actions processing
  event PendingActionsProcessed(bool finished);

  /* Storage variables */

  bool public initialized;

  NXMToken public token;
  TokenController public tokenController;

  uint public MIN_STAKE;         // Minimum allowed stake per contract
  uint public MAX_EXPOSURE;      // Stakes sum must be less than the deposit amount times this
  uint public MIN_UNSTAKE;       // Forbid unstake of small amounts to prevent spam
  uint public UNSTAKE_LOCK_TIME; // Lock period in seconds before unstaking takes place

  mapping(address => Staker) stakers;     // stakerAddress => Staker

  // temporary variables
  uint contractStaked;   // used when processing burns and rewards
  uint contractBurned;   // used when processing burns
  uint contractRewarded; // used when processing rewards

  // list of stakers for all contracts
  mapping(address => address[]) contractStakers;

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

  /* Modifiers */

  modifier noPendingActions {
    require(!hasPendingActions(), 'Unable to execute request with unprocessed actions');
    _;
  }

  modifier noPendingBurns {
    require(!hasPendingBurns(), 'Unable to execute request with unprocessed burns');
    _;
  }

  modifier noPendingUnstakeRequests {
    require(!hasPendingUnstakeRequests(), 'Unable to execute request with unprocessed unstake requests');
    _;
  }

  modifier noPendingRewards {
    require(!hasPendingRewards(), 'Unable to execute request with unprocessed rewards');
    _;
  }

  modifier whenNotPausedAndInitialized {
    require(!master.isPause(), "System is paused");
    require(initialized, "Contract is not initialized");
    _;
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

  function contractStake(address contractAddress) public view returns (uint) {

    address[] storage _stakers = contractStakers[contractAddress];
    uint stakerCount = _stakers.length;
    uint stakedOnContract;

    for (uint i = 0; i < stakerCount; i++) {
      Staker storage staker = stakers[_stakers[i]];
      uint deposit = staker.deposit;
      uint stake = staker.stakes[contractAddress];

      // add the minimum of the two
      stake = deposit < stake ? deposit : stake;
      stakedOnContract = stakedOnContract.add(stake);
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

  function stakerContractStake(address staker, address contractAddress) external view returns (uint) {
    uint stake = stakers[staker].stakes[contractAddress];
    uint deposit = stakers[staker].deposit;
    return stake < deposit ? stake : deposit;
  }

  function stakerContractPendingUnstakeTotal(address staker, address contractAddress) external view returns (uint) {
    return stakers[staker].pendingUnstakeRequestsTotal[contractAddress];
  }

  function stakerReward(address staker) external view returns (uint) {
    return stakers[staker].reward;
  }

  function stakerDeposit(address staker) external view returns (uint) {
    return stakers[staker].deposit;
  }

  function stakerMaxWithdrawable(address stakerAddress) public view returns (uint) {

    Staker storage staker = stakers[stakerAddress];
    uint deposit = staker.deposit;
    uint totalStaked;
    uint maxStake;

    for (uint i = 0; i < staker.contracts.length; i++) {

      address contractAddress = staker.contracts[i];
      uint initialStake = staker.stakes[contractAddress];
      uint stake = deposit < initialStake ? deposit : initialStake;
      totalStaked = totalStaked.add(stake);

      if (stake > maxStake) {
        maxStake = stake;
      }
    }

    uint minRequired = totalStaked.div(MAX_EXPOSURE);
    uint locked = maxStake > minRequired ? maxStake : minRequired;

    return deposit.sub(locked);
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

  function hasPendingActions() public view returns (bool) {
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

    return unstakeRequests[nextRequestIndex].unstakeAt <= now;
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
    uint newDeposit = oldDeposit.add(amount);

    staker.deposit = newDeposit;
    token.transferFrom(msg.sender, address(this), amount);

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
      }

      if (oldStake == newStake) {

        // if there were burns but the stake was not updated, update it now
        if (initialStake != newStake) {
          staker.stakes[contractAddress] = newStake;
        }

        totalStaked = totalStaked.add(newStake);

        // no other changes to this contract
        continue;
      }

      require(newStake >= MIN_STAKE, "Minimum stake amount not met");
      require(newStake <= newDeposit, "Cannot stake more than deposited");

      if (isNewStake) {
        staker.contracts.push(contractAddress);
      }

      if (isNewStake || !staker.isInContractStakers[contractAddress]) {
        staker.isInContractStakers[contractAddress] = true;
        contractStakers[contractAddress].push(msg.sender);
      }

      staker.stakes[contractAddress] = newStake;
      totalStaked = totalStaked.add(newStake);
      uint increase = newStake.sub(oldStake);

      emit Staked(contractAddress, msg.sender, increase);
    }

    require(
      totalStaked <= staker.deposit.mul(MAX_EXPOSURE),
      "Total stake exceeds maximum allowed"
    );

    if (amount > 0) {
      emit Deposited(msg.sender, amount);
    }
  }

  function withdraw(uint amount) external whenNotPausedAndInitialized onlyMember noPendingBurns {
    uint limit = stakerMaxWithdrawable(msg.sender);
    require(limit >= amount, "Requested amount exceeds max withdrawable amount");
    stakers[msg.sender].deposit = stakers[msg.sender].deposit.sub(amount);
    token.transfer(msg.sender, amount);
    emit Withdrawn(msg.sender, amount);
  }

  function requestUnstake(
    address[] calldata _contracts,
    uint[] calldata _amounts,
    uint _insertAfter // unstake request id after which the new unstake request will be inserted
  ) external whenNotPausedAndInitialized onlyMember {

    require(
      _contracts.length == _amounts.length,
      "Contracts and amounts arrays should have the same length"
    );

    require(_insertAfter <= lastUnstakeRequestId, 'Invalid unstake request id provided');

    Staker storage staker = stakers[msg.sender];
    uint deposit = staker.deposit;
    uint previousId = _insertAfter;
    uint unstakeAt = now.add(UNSTAKE_LOCK_TIME);

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
      uint max = pendingUnstakeAmount > stake ? 0 : stake.sub(pendingUnstakeAmount);

      require(max > 0, "Nothing to unstake on this contract");
      require(requestedAmount <= max, "Cannot unstake more than staked");

      // To prevent spam, small stakes and unstake requests are not allowed
      // However, we allow the user to unstake the entire amount
      if (requestedAmount != max) {
        require(requestedAmount >= MIN_UNSTAKE, "Unstaked amount cannot be less than minimum unstake amount");
        require(max.sub(requestedAmount) >= MIN_STAKE, "Remaining stake cannot be less than minimum unstake amount");
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
      uint newPending = staker.pendingUnstakeRequestsTotal[contractAddress].add(requestedAmount);
      staker.pendingUnstakeRequestsTotal[contractAddress] = newPending;

      // update the reference to the unstake request at target index for the next loop
      previousRequest = unstakeRequests[previousId];
    }
  }

  function withdrawReward(address stakerAddress) external whenNotPausedAndInitialized {

    uint amount = stakers[stakerAddress].reward;
    stakers[stakerAddress].reward = 0;

    token.transfer(stakerAddress, amount);

    emit RewardWithdrawn(stakerAddress, amount);
  }

  function pushBurn(
    address contractAddress, uint amount
  ) public onlyInternal whenNotPausedAndInitialized noPendingBurns noPendingUnstakeRequests {

    burn.amount = amount;
    burn.burnedAt = now;
    burn.contractAddress = contractAddress;

    emit BurnRequested(contractAddress, amount);
  }

  function pushReward(address contractAddress, uint amount) external onlyInternal whenNotPausedAndInitialized {

    rewards[++lastRewardId] = Reward(amount, now, contractAddress);

    if (firstReward == 0) {
      firstReward = lastRewardId;
    }

    emit RewardRequested(contractAddress, amount);
  }

  function processPendingActions(uint maxIterations) public whenNotPausedAndInitialized returns (bool) {

    uint iterationsLeft = maxIterations;
    bool finished;

    while (true) {

      uint firstUnstakeRequestIndex = unstakeRequests[0].next;
      UnstakeRequest storage unstakeRequest = unstakeRequests[firstUnstakeRequestIndex];
      Reward storage reward = rewards[firstReward];

      // read storage and cache in memory
      uint burnedAt = burn.burnedAt;
      uint rewardedAt = reward.rewardedAt;
      uint unstakeAt = unstakeRequest.unstakeAt;

      bool canUnstake = firstUnstakeRequestIndex > 0 && unstakeAt <= now;
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
          return false;
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
          return false;
        }

        _processFirstUnstakeRequest();
        --iterationsLeft;
        continue;
      }

      (finished, iterationsLeft) = _processFirstReward(iterationsLeft);

      if (!finished) {
        emit PendingActionsProcessed(false);
        return false;
      }
    }

    // everything is processed!
    emit PendingActionsProcessed(true);
    return true;
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
      _actualBurnAmount = _actualBurnAmount.add(_stakerBurnAmount);

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
    processedToStakerIndex = 0;
    isContractStakeCalculated = false;

    token.burn(_actualBurnAmount);
    emit Burned(_contractAddress, _actualBurnAmount);

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
      _stakerBurnAmount = _currentStake.mul(_totalBurnAmount).div(_stakedOnContract);
      _newStake = _currentStake.sub(_stakerBurnAmount);
    } else {
      // it's the whole stake
      _stakerBurnAmount = _currentStake;
    }

    if (_stakerBurnAmount != 0) {
      staker.deposit = _currentDeposit.sub(_stakerBurnAmount);
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
      _stakedOnContract = _stakedOnContract.add(stake);
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
    staker.stakes[contractAddress] = stake.sub(actualUnstakedAmount);

    uint pendingUnstakeRequestsTotal = staker.pendingUnstakeRequestsTotal[contractAddress];
    staker.pendingUnstakeRequestsTotal[contractAddress] = pendingUnstakeRequestsTotal.sub(requestedAmount);

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
    uint previousGas = gasleft();

    for (uint i = processedToStakerIndex; i < _stakerCount; i++) {

      if (iterationsLeft == 0) {
        contractRewarded = _actualRewardAmount;
        processedToStakerIndex = i;
        return (false, iterationsLeft);
      }

      --iterationsLeft;

      previousGas = gasleft();
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

      _actualRewardAmount = _actualRewardAmount.add(_stakerRewardAmount);
    }

    delete rewards[firstReward];
    processedToStakerIndex = 0;
    isContractStakeCalculated = false;

    if (++firstReward > lastRewardId) {
      firstReward = 0;
    }

    tokenController.mint(address(this), _actualRewardAmount);
    emit Rewarded(_contractAddress, _actualRewardAmount);

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
    rewardedAmount = totalRewardAmount.mul(stake).div(totalStakedOnContract);
    staker.reward = staker.reward.add(rewardedAmount);
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

  function initialize() internal {

    require(!initialized, "Contract is already initialized");

    tokenController.addToWhitelist(address(this));

    MIN_STAKE = 20 ether;
    MIN_UNSTAKE = 20 ether;
    MAX_EXPOSURE = 10;
    UNSTAKE_LOCK_TIME = 90 days;
  }

  event StakersMigrationCompleted(
    bool completed,
    uint memberIndex,
    uint stakeIndex
  );

  event MigratedMember(
    address member,
    uint memberIndex
  );

  function migrateStakers(uint maxIterations) external returns (bool){

    require(!initialized, "Migration already completed");

    TokenFunctions tokenFunctions = TokenFunctions(master.getLatestAddress("TF"));
    TokenData tokenData = TokenData(master.getLatestAddress("TD"));
    ClaimsReward claimsReward = ClaimsReward(master.getLatestAddress("CR"));
    MemberRoles memberRoles = MemberRoles(master.getLatestAddress("MR"));

    uint iterationsLeft = maxIterations;
    uint membersLength = memberRoles.membersLength(uint(MemberRoles.Role.Member));

    for (uint memberIndex = processedToStakerIndex; memberIndex < membersLength; memberIndex++) {

      (address member, bool isActive) = memberRoles.memberAtIndex(uint(MemberRoles.Role.Member), memberIndex);

      if (!isActive) {
        continue;
      }

      uint stakedContractsCount = tokenData.getStakerStakedContractLength(member);
      uint commissionsLeftToProcess = tokenData.getStakerTotalEarnedStakeCommission(member)
        .sub(tokenData.getStakerTotalReedmedStakeCommission(member));

      if (commissionsLeftToProcess > 0) {
        claimsReward._claimStakeCommission(stakedContractsCount, member);
      }

      // we're reusing firstReward storage variable in order to avoid
      // declaration of variables that will only be used for the migration
      for (uint i = firstReward; i < stakedContractsCount; i++) {

        if (iterationsLeft == 0) {
          processedToStakerIndex = memberIndex;
          firstReward = i;
          emit StakersMigrationCompleted(false, memberIndex, i);
          return false;
        }

        --iterationsLeft;

        address contractAddress = tokenData.getStakerStakedContractByIndex(member, i);
        uint stakerContractIndex = tokenData.getStakerStakedContractIndex(member, i);

        unlockStakerUnlockableTokensForContract(
          tokenData, tokenFunctions, member, contractAddress, stakerContractIndex, i
        );

        (, uint stakedAmount) = tokenFunctions._deprecated_unlockableBeforeBurningAndCanBurn(member, contractAddress, i);

        if (stakedAmount > 0) {
          stakeForMemberOnContract(tokenData, member, contractAddress, stakedAmount, stakerContractIndex, i);
        }
      }

      emit MigratedMember(member, memberIndex);

      // reset start index for the next iteration
      firstReward = 0;
    }

    initialized = true;

    // reset migration indexes
    processedToStakerIndex = 0;
    firstReward = 0;
    emit StakersMigrationCompleted(true, processedToStakerIndex, firstReward);

    return true;
  }

  function stakeForMemberOnContract(
    TokenData tokenData,
    address stakerAddress,
    address contractAddress,
    uint stakedAmount,
    uint stakerContractIndex,
    uint i
  ) internal {

    Staker storage staker = stakers[stakerAddress];
    staker.deposit = staker.deposit.add(stakedAmount);
    staker.stakes[contractAddress] = staker.stakes[contractAddress].add(stakedAmount);

    tokenData.pushBurnedTokens(stakerAddress, i, stakedAmount);
    bytes32 lockReason = keccak256(abi.encodePacked("UW", stakerAddress, contractAddress, stakerContractIndex));
    tokenController.burnLockedTokens(stakerAddress, lockReason, stakedAmount);

    if (!staker.isInContractStakers[contractAddress]) {
      staker.contracts.push(contractAddress);
      staker.isInContractStakers[contractAddress] = true;
      contractStakers[contractAddress].push(stakerAddress);
    }

    tokenController.mint(address(this), stakedAmount);
  }

  function unlockStakerUnlockableTokensForContract(
    TokenData tokenData,
    TokenFunctions tokenFunctions,
    address stakerAddress,
    address contractAddress,
    uint stakerContractIndex,
    uint i
  ) internal {

    uint unlockableAmount = tokenFunctions._deprecated_getStakerUnlockableTokensOnSmartContract(
      stakerAddress, contractAddress, stakerContractIndex
    );

    tokenData.setUnlockableBeforeLastBurnTokens(stakerAddress, i, 0);
    tokenData.pushUnlockedStakedTokens(stakerAddress, i, unlockableAmount);

    bytes32 lockReason = keccak256(abi.encodePacked("UW", stakerAddress, contractAddress, stakerContractIndex));
    tokenController.releaseLockedTokens(stakerAddress, lockReason, unlockableAmount);
  }

  function changeDependentContractAddress() public {

    token = NXMToken(master.tokenAddress());
    tokenController = TokenController(master.getLatestAddress("TC"));

    if (!initialized) {
      initialize();
    }
  }

}
