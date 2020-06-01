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

pragma solidity ^0.5.17;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./abstract/MasterAware.sol";
import "./abstract/NXMToken.sol";
import "./interfaces/ITokenController.sol";

contract PooledStaking is MasterAware {
  using SafeMath for uint;

  /* Data types */

  enum ParamType {
    MIN_STAKE,
    MAX_EXPOSURE,
    MIN_UNSTAKE,
    UNSTAKE_LOCK_TIME
  }

  struct Staker {
    uint deposit; // total amount of deposit nxm
    uint reward; // total amount that is ready to be claimed
    address[] contracts; // list of contracts the staker has staked on

    // staked amounts for each contract
    mapping(address => uint) stakes;

    // amount pending to be subtracted after all unstake requests will be processed
    mapping(address => uint) pendingUnstakeRequestsTotal;
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
  ITokenController public tokenController;

  uint public MIN_STAKE;         // Minimum allowed stake per contract
  uint public MAX_EXPOSURE;      // Stakes sum must be less than the deposit amount times this
  uint public MIN_UNSTAKE;       // Forbid unstake of small amounts to prevent spam
  uint public UNSTAKE_LOCK_TIME; // Lock period in seconds before unstaking takes place

  mapping(address => Staker) public stakers;     // stakerAddress => Staker

  uint public contractStaked; // temporary variable used while processing burns and rewards
  uint public contractBurned; // temporary variable used while processing burns
  uint public contractRewarded; // temporary variable used while processing rewards
  mapping(address => address[]) public contractsStakers; // list of stakers for all contracts

  // there can be only one pending burn
  Burn public burn;

  mapping(uint => Reward) public rewards; // reward id => Reward
  uint public firstReward;
  uint public lastRewardId;

  mapping(uint => UnstakeRequest) public unstakeRequests; // unstake id => UnstakeRequest
  // firstUnstakeRequest is stored at unstakeRequests[0].next
  uint public lastUnstakeRequestId;

  uint public processedToStakerIndex; // we processed the action up this staker
  bool public contractStakeCalculated; // flag to indicate whether staked amount is up to date or not

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

  /* Getters and view functions */

  function contractStakerCount(address contractAddress) public view returns (uint) {
    return contractsStakers[contractAddress].length;
  }

  function contractStakerAtIndex(address contractAddress, uint stakerIndex) public view returns (address) {
    return contractsStakers[contractAddress][stakerIndex];
  }

  function contractStakers(address contractAddress) public view returns (address[] memory _stakers) {
    // TODO: is this view actually needed?
    return contractsStakers[contractAddress];
  }

  function contractStake(address contractAddress) public view returns (uint) {

    address[] storage _stakers = contractsStakers[contractAddress];
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

  function stakerContractCount(address staker) public view returns (uint) {
    return stakers[staker].contracts.length;
  }

  function stakerContractAtIndex(address staker, uint contractIndex) public view returns (address) {
    return stakers[staker].contracts[contractIndex];
  }

  function stakerContracts(address staker) public view returns (address[] memory) {
    return stakers[staker].contracts;
  }

  function stakerContractStake(address staker, address contractAddress) public view returns (uint) {
    uint stake = stakers[staker].stakes[contractAddress];
    uint deposit = stakers[staker].deposit;
    return stake < deposit ? stake : deposit;
  }

  function stakerContractPendingUnstakeRequestsTotal(address staker, address contractAddress) public view returns (uint) {
    return stakers[staker].pendingUnstakeRequestsTotal[contractAddress];
  }

  function stakerReward(address staker) external view returns (uint) {
    return stakers[staker].reward;
  }

  function stakerDeposit(address staker) external view returns (uint) {
    return stakers[staker].deposit;
  }

  function stakerProcessedDeposit(address stakerAddress) external view returns (uint) {

    Staker storage staker = stakers[stakerAddress];
    uint deposit = staker.deposit;

    if (burn.burnedAt == 0) {
      return deposit;
    }

    address contractAddress = burn.contractAddress;

    // TODO: block the call to this function if there's a pending burn for this user
    uint totalContractStake = contractStake(contractAddress);
    uint stake = staker.stakes[contractAddress];
    stake = deposit < stake ? deposit : stake;

    if (totalContractStake != 0) {
      uint stakerBurn = stake.mul(burn.amount).div(totalContractStake);
      deposit = deposit.sub(stakerBurn);
    }

    return deposit;
  }

  function unstakeRequestAtIndex(uint unstakeRequestId) public view returns (
    uint amount, uint unstakeAt, address contractAddress, address stakerAddress, uint next
  ) {
    UnstakeRequest storage unstakeRequest = unstakeRequests[unstakeRequestId];
    amount = unstakeRequest.amount;
    unstakeAt = unstakeRequest.unstakeAt;
    contractAddress = unstakeRequest.contractAddress;
    stakerAddress = unstakeRequest.stakerAddress;
    next = unstakeRequest.next;
  }

  function getMaxWithdrawable(address stakerAddress) public view returns (uint) {

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
  ) external whenNotPaused onlyMember noPendingActions {

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

      require(newStake >= MIN_STAKE, "Stake minimum not met");
      require(newStake <= newDeposit, "Cannot stake more than deposited");

      if (!isNewStake) {
        require(contractAddress == staker.contracts[i], "Unexpected contract order");
        require(oldStake <= newStake, "New stake is less than previous stake");
      }

      if (oldStake == newStake) {
        // no other changes to this contract
        continue;
      }

      if (isNewStake) {
        staker.contracts.push(contractAddress);
      }

      if (isNewStake || oldStake == 0) {
        contractsStakers[contractAddress].push(msg.sender);
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

  function withdraw(uint amount) external whenNotPaused onlyMember noPendingBurns {
    uint limit = getMaxWithdrawable(msg.sender);
    require(limit >= amount, "Requested amount exceeds max withdrawable amount");
    stakers[msg.sender].deposit = stakers[msg.sender].deposit.sub(amount);
    token.transfer(msg.sender, amount);
    emit Withdrawn(msg.sender, amount);
  }

  function createUnstakeRequest(
    address[] calldata _contracts,
    uint[] calldata _amounts,
    uint _insertAfter // unstake request id after which the new unstake request will be inserted
  ) external whenNotPaused onlyMember {

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
        require(requestedAmount >= MIN_UNSTAKE, "Unstake cannot be less then minimum unstake amount");
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

  function withdrawReward(address staker, uint amount) external whenNotPaused onlyMember {

    require(
      stakers[staker].reward >= amount,
      "Requested amount exceeds available reward"
    );

    stakers[staker].reward = stakers[staker].reward.sub(amount);
    token.transfer(staker, amount);

    emit RewardWithdrawn(staker, amount);
  }

  function pushBurn(
    address contractAddress, uint amount
  ) public onlyInternal whenNotPaused noPendingBurns noPendingUnstakeRequests {

    burn.amount = amount;
    burn.burnedAt = now;
    burn.contractAddress = contractAddress;

    emit BurnRequested(contractAddress, amount);
  }

  function pushReward(address contractAddress, uint amount) external onlyInternal whenNotPaused {

    rewards[++lastRewardId] = Reward(amount, now, contractAddress);

    if (firstReward == 0) {
      firstReward = lastRewardId;
    }

    emit RewardRequested(contractAddress, amount);
  }

  function processPendingActions() public whenNotPaused returns (bool) {

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

        // O(n)
        if (!_processFirstBurn()) {
          emit PendingActionsProcessed(false);
          return false;
        }

        continue;
      }

      if (
        canUnstake &&
        (!canReward || unstakeAt < rewardedAt)
      ) {

        if (!_processFirstUnstakeRequest()) {
          emit PendingActionsProcessed(false);
          return false;
        }

        continue;
      }

      // O(n)
      if (!_processFirstReward()) {
        emit PendingActionsProcessed(false);
        return false;
      }
    }

    // everything is processed!
    emit PendingActionsProcessed(true);
    return true;
  }

  function _processFirstBurn() internal returns (bool) {

    address _contractAddress = burn.contractAddress;
    address[] storage _contractStakers = contractsStakers[_contractAddress];
    uint _stakerCount = _contractStakers.length;

    uint _totalBurnAmount = burn.amount;
    uint _actualBurnAmount = contractBurned;
    uint _stakedOnContract;
    uint previousGas = gasleft();

    if (!contractStakeCalculated) {

      // calculate amount staked on contract
      for (uint i = processedToStakerIndex; i < _stakerCount; i++) {

        // stop if the cycle consumed more than 20% of the remaning gas
        // gasleft() < previousGas * 4/5
        if (5 * gasleft() < 4 * previousGas) {
          processedToStakerIndex = i;
          return false;
        }

        previousGas = gasleft();

        Staker storage staker = stakers[_contractStakers[i]];
        uint deposit = staker.deposit;
        uint stake = staker.stakes[_contractAddress];
        stake = deposit < stake ? deposit : stake;
        _stakedOnContract = _stakedOnContract.add(stake);
      }

      contractStaked = _stakedOnContract;
      contractStakeCalculated = true;
      processedToStakerIndex = 0;

    } else {
      // use previously calculated staked amount
      _stakedOnContract = contractStaked;
    }

    if (_totalBurnAmount > _stakedOnContract) {
      _totalBurnAmount = _stakedOnContract;
    }

    for (uint i = processedToStakerIndex; i < _stakerCount; i++) {

      if (5 * gasleft() < 4 * previousGas) {
        contractBurned = _actualBurnAmount;
        processedToStakerIndex = i;
        return false;
      }

      (uint _stakerBurnAmount, uint _newStake) = _burnStaker(
        _contractStakers[i], _contractAddress, _totalBurnAmount, _stakedOnContract
      );

      if (_newStake == 0) {
        // when the stake is explicitly set to 0
        // the staker is removed from the contract stakers array
        // we will re-add the staker if he stakes again
        _contractStakers[i] = _contractStakers[_stakerCount - 1];
        _contractStakers.pop();
        // i-- might underflow to MAX_UINT
        // but that's fine since it will be incremented back to 0 on the next loop
        i--;
        _stakerCount--;
      }

      _actualBurnAmount = _actualBurnAmount.add(_stakerBurnAmount);
    }

    delete burn;
    processedToStakerIndex = 0;
    contractStakeCalculated = false;

    token.burn(_actualBurnAmount);
    emit Burned(_contractAddress, _actualBurnAmount);

    return true;
  }

  function _burnStaker(
    address stakerAddress, address contractAddress, uint totalBurnAmount, uint totalStakedOnContract
  ) internal returns (
    uint burnedAmount, uint newStake
  ) {

    Staker storage staker = stakers[stakerAddress];
    uint deposit = staker.deposit;
    uint stake = staker.stakes[contractAddress];

    if (stake > deposit) {
      stake = deposit;
    }

    // prevent division by zero and set stake to zero
    if (totalStakedOnContract == 0) {
      staker.stakes[contractAddress] = 0;
      return (0, 0);
    }

    // formula: staker_burn = staker_stake / total_contract_stake * contract_burn
    // reordered for precision loss prevention
    burnedAmount = stake.mul(totalBurnAmount).div(totalStakedOnContract);

    // update staker's deposit
    staker.deposit = deposit.sub(burnedAmount);
    newStake = stake.sub(burnedAmount);
    staker.stakes[contractAddress] = newStake;
  }

  function _processFirstUnstakeRequest() internal returns (bool) {

    // unstake request processing is O(1) and was calculated to consume around 100k
    if (gasleft() < 11e4) {
      return false;
    }

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

    return true;
  }

  function _processFirstReward() internal returns (bool) {

    Reward storage reward = rewards[firstReward];
    address _contractAddress = reward.contractAddress;
    uint _totalRewardAmount = reward.amount;

    address[] storage _contractStakers = contractsStakers[_contractAddress];
    uint _stakerCount = _contractStakers.length;

    uint _actualRewardAmount = contractRewarded;
    uint _stakedOnContract;
    uint previousGas = gasleft();

    if (!contractStakeCalculated) {

      // calculate amount staked on contract
      for (uint i = processedToStakerIndex; i < _stakerCount; i++) {

        // stop if the cycle consumed more than 20% of the remaning gas
        // gasleft() < previousGas * 4/5
        if (5 * gasleft() < 4 * previousGas) {
          processedToStakerIndex = i;
          return false;
        }

        previousGas = gasleft();

        address stakerAddress = _contractStakers[i];
        Staker storage staker = stakers[stakerAddress];

        uint deposit = staker.deposit;
        uint stake = staker.stakes[_contractAddress];
        stake = deposit < stake ? deposit : stake;
        _stakedOnContract = _stakedOnContract.add(stake);
      }

      contractStaked = _stakedOnContract;
      contractStakeCalculated = true;
      processedToStakerIndex = 0;

    } else {
      // use previously calculated staked amount
      _stakedOnContract = contractStaked;
    }

    for (uint i = processedToStakerIndex; i < _stakerCount; i++) {

      if (5 * gasleft() < 4 * previousGas) {
        contractRewarded = _actualRewardAmount;
        processedToStakerIndex = i;
        return false;
      }

      previousGas = gasleft();

      (uint _stakerRewardAmount, uint _stake) = _rewardStaker(
        _contractStakers[i], _contractAddress, _totalRewardAmount, _stakedOnContract
      );

      // remove 0-amount stakers, similar to what we're doing when processing burns
      if (_stake == 0) {
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
    contractStakeCalculated = false;

    if (++firstReward > lastRewardId) {
      firstReward = 0;
    }

    tokenController.mint(address(this), _actualRewardAmount);
    emit Rewarded(_contractAddress, _actualRewardAmount);

    return true;
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
    if (totalStakedOnContract == 0) {
      staker.stakes[contractAddress] = 0;
      return (0, 0);
    }

    // reward = staker_stake / total_contract_stake * total_reward
    rewardedAmount = totalRewardAmount.mul(stake).div(totalStakedOnContract);
    staker.reward = staker.reward.add(rewardedAmount);
  }

  function updateParameter(uint paramIndex, uint value) external onlyGovernance {

    ParamType param = ParamType(paramIndex);

    if (param == ParamType.MIN_STAKE) {
      MIN_STAKE = value;
      return;
    }

    if (param == ParamType.MAX_EXPOSURE) {
      MAX_EXPOSURE = value;
      return;
    }

    if (param == ParamType.MIN_UNSTAKE) {
      MIN_UNSTAKE = value;
      return;
    }

    if (param == ParamType.UNSTAKE_LOCK_TIME) {
      UNSTAKE_LOCK_TIME = value;
      return;
    }
  }

  function initialize() internal {

    if (initialized) {
      return;
    }

    initialized = true;

    tokenController.addToWhitelist(address(this));

    MIN_STAKE = 20 ether;
    MIN_UNSTAKE = 20 ether;
    MAX_EXPOSURE = 10;
    UNSTAKE_LOCK_TIME = 90 days;

    // TODO: implement staking migration here
  }

  function changeDependentContractAddress() public {
    token = NXMToken(master.tokenAddress());
    tokenController = ITokenController(master.getLatestAddress("TC"));
    initialize();
  }

}
