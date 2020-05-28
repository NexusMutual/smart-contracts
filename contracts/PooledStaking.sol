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
    MIN_ALLOCATION,
    MAX_LEVERAGE,
    MIN_DEALLOCATION,
    DEALLOCATE_LOCK_TIME
  }

  struct Staker {
    uint staked; // total amount of staked nxm
    uint reward; // total amount that is ready to be claimed
    address[] contracts; // list of contracts the staker has staked on

    // allocated stake amounts for each contract
    mapping(address => uint) allocations;

    // amount pending to be subtracted after all deallocations will be processed
    mapping(address => uint) pendingDeallocations;
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

  struct Deallocation {
    uint amount;
    uint deallocateAt;
    address contractAddress;
    address stakerAddress;
    uint next; // id of the next deallocation request in the linked list
  }

  /* Events */

  // stakes
  event Staked(address indexed staker, uint amount);
  event Unstaked(address indexed staker, uint amount);

  // allocations
  event Allocated(address indexed contractAddress, address indexed staker, uint amount);
  event DeallocationRequested(address indexed contractAddress, address indexed staker, uint amount, uint deallocateAt);
  event Deallocated(address indexed contractAddress, address indexed staker, uint amount);

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

  uint public MIN_ALLOCATION;           // Minimum allowed stake per contract
  uint public MAX_LEVERAGE;             // Stakes sum must be less than the deposited amount times this
  uint public MIN_DEALLOCATION;         // Forbid deallocation of small amounts to prevent spam
  uint public DEALLOCATE_LOCK_TIME;     // Lock period in seconds before unstaking takes place

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

  mapping(uint => Deallocation) public deallocations; // deallocation id => Deallocation
  // firstDeallocation is stored at deallocations[0].next
  uint public lastDeallocationId;

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

  modifier noPendingDeallocations {
    require(!hasPendingDeallocations(), 'Unable to execute request with unprocessed deallocations');
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
      uint stake = staker.staked;
      uint allocation = staker.allocations[contractAddress];

      // add the minimum of the two
      allocation = stake < allocation ? stake : allocation;
      stakedOnContract = stakedOnContract.add(allocation);
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

  function stakerContractAllocation(address staker, address contractAddress) public view returns (uint) {
    uint allocation = stakers[staker].allocations[contractAddress];
    uint stake = stakers[staker].staked;
    return allocation < stake ? allocation : stake;
  }

  function stakerContractPendingDeallocation(address staker, address contractAddress) public view returns (uint) {
    return stakers[staker].pendingDeallocations[contractAddress];
  }

  function stakerReward(address staker) external view returns (uint) {
    return stakers[staker].reward;
  }

  function stakerStake(address staker) external view returns (uint) {
    return stakers[staker].staked;
  }

  function stakerProcessedStake(address stakerAddress) external view returns (uint) {

    Staker storage staker = stakers[stakerAddress];
    uint staked = staker.staked;

    if (burn.burnedAt == 0) {
      return staked;
    }

    address contractAddress = burn.contractAddress;

    // TODO: block the call to this function if there's a pending burn for this user
    uint totalContractStake = contractStake(contractAddress);
    uint allocation = staker.allocations[contractAddress];
    allocation = staked < allocation ? staked : allocation;

    if (totalContractStake != 0) {
      uint stakerBurn = allocation.mul(burn.amount).div(totalContractStake);
      staked = staked.sub(stakerBurn);
    }

    return staked;
  }

  function deallocationAtIndex(uint deallocationId) public view returns (
    uint amount, uint deallocateAt, address contractAddress, address stakerAddress, uint next
  ) {
    Deallocation storage deallocation = deallocations[deallocationId];
    amount = deallocation.amount;
    deallocateAt = deallocation.deallocateAt;
    contractAddress = deallocation.contractAddress;
    stakerAddress = deallocation.stakerAddress;
    next = deallocation.next;
  }

  function getMaxUnstakable(address stakerAddress) public view returns (uint) {

    Staker storage staker = stakers[stakerAddress];
    uint staked = staker.staked;
    uint totalAllocated;
    uint maxAllocation;

    for (uint i = 0; i < staker.contracts.length; i++) {

      address contractAddress = staker.contracts[i];
      uint initialAllocation = staker.allocations[contractAddress];
      uint allocation = staked < initialAllocation ? staked : initialAllocation;
      totalAllocated = totalAllocated.add(allocation);

      if (maxAllocation < allocation) {
        maxAllocation = allocation;
      }
    }

    uint minRequired = totalAllocated.div(MAX_LEVERAGE);
    uint locked = maxAllocation > minRequired ? maxAllocation : minRequired;

    return staked.sub(locked);
  }

  function hasPendingActions() public view returns (bool) {
    return hasPendingBurns() || hasPendingDeallocations() || hasPendingRewards();
  }

  function hasPendingBurns() public view returns (bool) {
    return burn.burnedAt != 0;
  }

  function hasPendingDeallocations() public view returns (bool){

    uint nextDeallocationIndex = deallocations[0].next;

    if (nextDeallocationIndex == 0) {
      return false;
    }

    return deallocations[nextDeallocationIndex].deallocateAt <= now;
  }

  function hasPendingRewards() public view returns (bool){
    return rewards[firstReward].rewardedAt != 0;
  }

  /* State-changing functions */

  function stake(
    uint amount,
    address[] calldata _contracts,
    uint[] calldata _allocations
  ) external whenNotPaused onlyMember noPendingActions {

    Staker storage staker = stakers[msg.sender];
    uint oldLength = staker.contracts.length;

    require(
      _contracts.length >= oldLength,
      "Allocating to fewer contracts is not allowed"
    );

    require(
      _contracts.length == _allocations.length,
      "Contracts and allocations arrays should have the same length"
    );

    uint totalAllocation;

    // cap old allocations to this amount
    uint oldStake = staker.staked;
    uint newStake = oldStake.add(amount);

    staker.staked = newStake;
    token.transferFrom(msg.sender, address(this), amount);

    for (uint i = 0; i < _contracts.length; i++) {

      address contractAddress = _contracts[i];

      for (uint j = 0; j < i; j++) {
        require(_contracts[j] != contractAddress, "Contracts array should not contain duplicates");
      }

      uint initialAllocation = staker.allocations[contractAddress];
      uint oldAllocation = oldStake < initialAllocation ? oldStake : initialAllocation;
      uint newAllocation = _allocations[i];
      bool isNewAllocation = i >= oldLength;

      require(newAllocation >= MIN_ALLOCATION, "Allocation minimum not met");
      require(newAllocation <= newStake, "Cannot allocate more than staked");

      if (!isNewAllocation) {
        require(contractAddress == staker.contracts[i], "Unexpected contract order");
        require(oldAllocation <= newAllocation, "New allocation is less than previous allocation");
      }

      if (oldAllocation == newAllocation) {
        // no other changes to this contract
        continue;
      }

      if (isNewAllocation) {
        staker.contracts.push(contractAddress);
      }

      if (isNewAllocation || oldAllocation == 0) {
        contractsStakers[contractAddress].push(msg.sender);
      }

      staker.allocations[contractAddress] = newAllocation;
      totalAllocation = totalAllocation.add(newAllocation);
      uint increase = newAllocation.sub(oldAllocation);

      emit Allocated(contractAddress, msg.sender, increase);
    }

    require(
      totalAllocation <= staker.staked.mul(MAX_LEVERAGE),
      "Total allocation exceeds maximum allowed"
    );

    emit Staked(msg.sender, amount);
  }

  function unstake(uint amount) external whenNotPaused onlyMember noPendingBurns {
    uint unstakable = getMaxUnstakable(msg.sender);
    require(unstakable >= amount, "Requested amount exceeds max unstakable amount");
    stakers[msg.sender].staked = stakers[msg.sender].staked.sub(amount);
    token.transfer(msg.sender, amount);
    emit Unstaked(msg.sender, amount);
  }

  function requestDeallocation(
    address[] calldata _contracts,
    uint[] calldata _amounts,
    uint _insertAfter // deallocation id after which the new deallocations will be inserted
  ) external whenNotPaused onlyMember {

    require(
      _contracts.length == _amounts.length,
      "Contracts and amounts arrays should have the same length"
    );

    require(_insertAfter <= lastDeallocationId, 'Invalid deallocation id provided');

    Staker storage staker = stakers[msg.sender];
    uint staked = staker.staked;
    uint previousId = _insertAfter;
    uint deallocateAt = now.add(DEALLOCATE_LOCK_TIME);

    Deallocation storage previousDeallocation = deallocations[previousId];

    // Forbid insertion after an empty slot when there are non-empty slots
    // previousId != 0 allows inserting on the first position (in case lock time has been reduced)
    if (previousId != 0) {
      require(previousDeallocation.deallocateAt != 0, "Provided deallocation id should not be an empty slot");
    }

    for (uint i = 0; i < _contracts.length; i++) {

      address contractAddress = _contracts[i];
      uint allocation = staker.allocations[contractAddress];

      if (allocation > staked) {
        allocation = staked;
      }

      uint pendingDeallocation = staker.pendingDeallocations[contractAddress];
      uint requestedAmount = _amounts[i];
      uint max = pendingDeallocation > allocation ? 0 : allocation.sub(pendingDeallocation);

      require(max > 0, "Nothing to deallocate on this contract");
      require(requestedAmount <= max, "Cannot deallocate more than allocated");

      // To prevent spam, small stakes and deallocations are not allowed
      // However, we allow the user to deallocate the entire amount
      if (requestedAmount != max) {
        require(requestedAmount >= MIN_DEALLOCATION, "Deallocation cannot be less then MIN_DEALLOCATION");
        require(max.sub(requestedAmount) >= MIN_ALLOCATION, "Final allocation cannot be less then MIN_ALLOCATION");
      }

      require(
        deallocateAt >= previousDeallocation.deallocateAt,
        "Deallocation time must be greater or equal to previous deallocation"
      );

      if (previousDeallocation.next != 0) {
        Deallocation storage nextDeallocation = deallocations[previousDeallocation.next];
        require(
          nextDeallocation.deallocateAt > deallocateAt,
          "Next deallocation time must be greater than new deallocation time"
        );
      }

      // Note: We previously had an `id` variable that was assigned immediately to `previousId`.
      //   It was removed in order to save some memory and previousId used instead.
      //   This makes the next section slightly harder to read but you can read "previousId" as "newId" instead.

      // get next available deallocation id. our new deallocation becomes previous for the next loop
      previousId = ++lastDeallocationId;

      deallocations[previousId] = Deallocation(
        requestedAmount,
        deallocateAt,
        contractAddress,
        msg.sender,
        previousDeallocation.next
      );

      // point to our new deallocation
      previousDeallocation.next = previousId;

      emit DeallocationRequested(contractAddress, msg.sender, requestedAmount, deallocateAt);

      // increase pending deallocation amount so we keep track of final allocation
      uint newPending = staker.pendingDeallocations[contractAddress].add(requestedAmount);
      staker.pendingDeallocations[contractAddress] = newPending;

      // Update the reference to the dealocation at target index for the next loop
      previousDeallocation = deallocations[previousId];
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
  ) public onlyInternal whenNotPaused noPendingBurns noPendingDeallocations {

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

      uint firstDeallocationIndex = deallocations[0].next;
      Deallocation storage deallocation = deallocations[firstDeallocationIndex];
      Reward storage reward = rewards[firstReward];

      // read storage and cache in memory
      uint burnedAt = burn.burnedAt;
      uint rewardedAt = reward.rewardedAt;
      uint deallocateAt = deallocation.deallocateAt;

      bool canDeallocate = firstDeallocationIndex > 0 && deallocateAt <= now;
      bool canBurn = burnedAt != 0;
      bool canReward = firstReward != 0;

      if (!canBurn && !canDeallocate && !canReward) {
        // everything is processed
        break;
      }

      if (
        canBurn &&
        (!canDeallocate || burnedAt < deallocateAt) &&
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
        canDeallocate &&
        (!canReward || deallocateAt < rewardedAt)
      ) {

        if (!_processFirstDeallocation()) {
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

    address contractAddress = burn.contractAddress;
    uint totalBurnAmount = burn.amount;

    address[] storage _contractStakers = contractsStakers[contractAddress];
    uint stakerCount = _contractStakers.length;

    uint actualBurnAmount = contractBurned;
    uint stakedOnContract;
    uint previousGas = gasleft();

    if (!contractStakeCalculated) {

      // calculate amount staked on contract
      for (uint i = processedToStakerIndex; i < stakerCount; i++) {

        // stop if the cycle consumed more than 20% of the remaning gas
        // gasleft() < previousGas * 4/5
        if (5 * gasleft() < 4 * previousGas) {
          processedToStakerIndex = i;
          return false;
        }

        previousGas = gasleft();

        Staker storage staker = stakers[_contractStakers[i]];
        uint staked = staker.staked;
        uint allocation = staker.allocations[contractAddress];
        allocation = staked < allocation ? staked : allocation;
        stakedOnContract = stakedOnContract.add(allocation);
      }

      contractStaked = stakedOnContract;
      contractStakeCalculated = true;
      processedToStakerIndex = 0;

    } else {
      // use previously calculated staked amount
      stakedOnContract = contractStaked;
    }

    if (totalBurnAmount > stakedOnContract) {
      totalBurnAmount = stakedOnContract;
    }

    for (uint i = processedToStakerIndex; i < stakerCount; i++) {

      if (5 * gasleft() < 4 * previousGas) {
        contractBurned = actualBurnAmount;
        processedToStakerIndex = i;
        return false;
      }

      previousGas = gasleft();

      uint stakerBurnAmount;
      uint newAllocation;

      (stakerBurnAmount, newAllocation) = _burnStaker(
        _contractStakers[i], contractAddress, totalBurnAmount, stakedOnContract
      );

      if (newAllocation == 0) {
        // when the allocation is explicitly set to 0
        // the staker is removed from the contract stakers array
        // we will re-add the staker if he stakes again
        _contractStakers[i] = _contractStakers[stakerCount - 1];
        _contractStakers.pop();
        // i-- might underflow to MAX_UINT
        // but that's fine since it will be incremented back to 0 on the next loop
        i--;
        stakerCount--;
      }

      actualBurnAmount = actualBurnAmount.add(stakerBurnAmount);
    }

    delete burn;
    processedToStakerIndex = 0;
    contractStakeCalculated = false;

    token.burn(actualBurnAmount);
    emit Burned(contractAddress, actualBurnAmount);

    return true;
  }

  function _burnStaker(
    address stakerAddress, address contractAddress, uint totalBurnAmount, uint totalStakedOnContract
  ) internal returns (
    uint burnedAmount, uint newAllocation
  ) {

    Staker storage staker = stakers[stakerAddress];
    uint allocation = staker.allocations[contractAddress];
    uint staked = staker.staked;

    if (allocation > staked) {
      allocation = staked;
    }

    // prevent division by zero and set allocation to zero
    if (totalStakedOnContract == 0) {
      staker.allocations[contractAddress] = 0;
      return (0, 0);
    }

    // formula: staker_burn = staker_allocation / total_contract_stake * contract_burn
    // reordered for precision loss prevention
    burnedAmount = allocation.mul(totalBurnAmount).div(totalStakedOnContract);

    // update staker's stake
    staker.staked = staked.sub(burnedAmount);
    newAllocation = allocation.sub(burnedAmount);
    staker.allocations[contractAddress] = newAllocation;
  }

  function _processFirstDeallocation() internal returns (bool) {

    // deallocation is O(1) and consumes around 100k
    if (gasleft() < 11e4) {
      return false;
    }

    uint firstDeallocation = deallocations[0].next;
    Deallocation storage deallocation = deallocations[firstDeallocation];
    address stakerAddress = deallocation.stakerAddress;
    Staker storage staker = stakers[stakerAddress];

    address contractAddress = deallocation.contractAddress;
    uint staked = staker.staked;
    uint initialAllocation = staker.allocations[contractAddress];
    uint allocation = staked < initialAllocation ? staked : initialAllocation;

    uint deallocationAmount = deallocation.amount;
    uint actualDeallocationAmount = allocation < deallocationAmount ? allocation : deallocationAmount;
    staker.allocations[contractAddress] = allocation.sub(actualDeallocationAmount);

    uint pendingDeallocations = staker.pendingDeallocations[contractAddress];
    staker.pendingDeallocations[contractAddress] = pendingDeallocations.sub(deallocationAmount);

    // update pointer to first deallocation
    deallocations[0].next = deallocation.next;
    delete deallocations[firstDeallocation];

    emit Deallocated(contractAddress, stakerAddress, deallocationAmount);

    return true;
  }

  function _processFirstReward() internal returns (bool) {

    Reward storage reward = rewards[firstReward];
    address contractAddress = reward.contractAddress;
    uint totalRewardAmount = reward.amount;

    address[] storage _contractStakers = contractsStakers[contractAddress];
    uint stakerCount = _contractStakers.length;

    uint actualRewardAmount = contractRewarded;
    uint stakedOnContract;
    uint previousGas = gasleft();

    if (!contractStakeCalculated) {

      // calculate amount staked on contract
      for (uint i = processedToStakerIndex; i < stakerCount; i++) {

        // stop if the cycle consumed more than 20% of the remaning gas
        // gasleft() < previousGas * 4/5
        if (5 * gasleft() < 4 * previousGas) {
          processedToStakerIndex = i;
          return false;
        }

        previousGas = gasleft();

        address stakerAddress = _contractStakers[i];
        Staker storage staker = stakers[stakerAddress];

        uint staked = staker.staked;
        uint allocation = staker.allocations[contractAddress];
        allocation = staked < allocation ? staked : allocation;
        stakedOnContract = stakedOnContract.add(allocation);
      }

      contractStaked = stakedOnContract;
      contractStakeCalculated = true;
      processedToStakerIndex = 0;

    } else {
      // use previously calculated staked amount
      stakedOnContract = contractStaked;
    }

    for (uint i = processedToStakerIndex; i < stakerCount; i++) {

      if (5 * gasleft() < 4 * previousGas) {
        contractRewarded = actualRewardAmount;
        processedToStakerIndex = i;
        return false;
      }

      previousGas = gasleft();

      uint stakerRewardAmount;
      uint allocation;

      (stakerRewardAmount, allocation) = _rewardStaker(
        _contractStakers[i], contractAddress, totalRewardAmount, stakedOnContract
      );

      // remove 0-amount stakers, similar to what we're doing when processing burns
      if (allocation == 0) {
        _contractStakers[i] = _contractStakers[stakerCount - 1];
        _contractStakers.pop();
        i--;
        stakerCount--;

        // since the allocation is 0, there's no reward to give
        continue;
      }

      actualRewardAmount = actualRewardAmount.add(stakerRewardAmount);
    }

    delete rewards[firstReward];
    processedToStakerIndex = 0;
    contractStakeCalculated = false;

    if (++firstReward > lastRewardId) {
      firstReward = 0;
    }

    tokenController.mint(address(this), actualRewardAmount);
    emit Rewarded(contractAddress, actualRewardAmount);

    return true;
  }

  function _rewardStaker(
    address stakerAddress, address contractAddress, uint totalRewardAmount, uint totalStakedOnContract
  ) internal returns (uint rewardedAmount, uint allocation) {

    Staker storage staker = stakers[stakerAddress];
    allocation = staker.allocations[contractAddress];
    uint staked = staker.staked;

    if (allocation > staked) {
      allocation = staked;
    }

    // prevent division by zero and set allocation to zero
    if (totalStakedOnContract == 0) {
      staker.allocations[contractAddress] = 0;
      return (0, 0);
    }

    // reward = staker_allocation / total_contract_stake * total_reward
    rewardedAmount = totalRewardAmount.mul(allocation).div(totalStakedOnContract);
    staker.reward = staker.reward.add(rewardedAmount);
  }

  function updateParameter(uint paramIndex, uint value) external onlyGovernance {

    ParamType param = ParamType(paramIndex);

    if (param == ParamType.MIN_ALLOCATION) {
      MIN_ALLOCATION = value;
      return;
    }

    if (param == ParamType.MAX_LEVERAGE) {
      MAX_LEVERAGE = value;
      return;
    }

    if (param == ParamType.MIN_DEALLOCATION) {
      MIN_DEALLOCATION = value;
      return;
    }

    if (param == ParamType.DEALLOCATE_LOCK_TIME) {
      DEALLOCATE_LOCK_TIME = value;
      return;
    }
  }

  function initialize() internal {

    if (initialized) {
      return;
    }

    initialized = true;

    tokenController.addToWhitelist(address(this));

    MIN_ALLOCATION = 20 ether;
    MIN_DEALLOCATION = 20 ether;
    MAX_LEVERAGE = 10;
    DEALLOCATE_LOCK_TIME = 90 days;

    // TODO: implement staking migration here
  }

  function changeDependentContractAddress() public {
    token = NXMToken(master.tokenAddress());
    tokenController = ITokenController(master.getLatestAddress("TC"));
    initialize();
  }

}
