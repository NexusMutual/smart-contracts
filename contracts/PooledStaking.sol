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

pragma solidity ^0.5.16;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./base/MasterAware.sol";
import "./base/TokenAware.sol";
import "./libraries/Vault.sol";

contract PooledStaking is MasterAware, TokenAware {
  using SafeMath for uint;

  enum ParamType {
    MIN_ALLOCATION,
    MAX_LEVERAGE,
    MIN_ALLOWED_DEALLOCATION,
    DEALLOCATE_LOCK_TIME,
    BURN_CYCLE_GAS_LIMIT,
    DEALLOCATION_CYCLE_GAS_LIMIT,
    REWARD_CYCLE_GAS_LIMIT
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

  struct Contract {
    uint staked; // amount of nxm staked for this contract
    uint burned; // sum of unprocessed burn amounts
    // TODO: find a way to remove zero-amount stakers
    address[] stakers; // used for iteration
  }

  struct Burn {
    uint amount;
    uint burnedAt;
    address contractAddress;
    uint next; // id of the next deallocation request in the linked list
  }

  struct Reward {
    uint amount;
    uint rewardedAt;
    address contractAddress;
    uint next; // id of the next deallocation request in the linked list
  }

  struct Deallocation {
    uint amount;
    uint deallocateAt;
    address contractAddress;
    address stakerAddress;
    uint next; // id of the next deallocation request in the linked list
  }

  uint public MIN_ALLOCATION;           // Minimum allowed stake per contract
  uint public MAX_LEVERAGE;             // Stakes sum must be less than the deposited amount times this
  uint public MIN_ALLOWED_DEALLOCATION; // Forbid deallocation of small amounts to prevent spam
  uint public DEALLOCATE_LOCK_TIME;     // Lock period before unstaking takes place
  uint public BURN_CYCLE_GAS_LIMIT;
  uint public DEALLOCATION_CYCLE_GAS_LIMIT;
  uint public REWARD_CYCLE_GAS_LIMIT;

  // List of all contract addresses
  address[] public contractAddresses;

  mapping(address => Staker) public stakers;     // stakerAddress => Staker
  mapping(address => Contract) public contracts; // contractAddress => Contract

  mapping(uint => Burn) public burns; // burn id => Burn
  uint public firstBurn; // linked list head element. points to an empty slot if there are no burns
  uint public burnCount; // amount of burns that have been pushed (including processed)

  mapping(uint => Reward) public rewards; // reward id => Reward
  uint public firstReward;
  uint public rewardCount;

  mapping(uint => Deallocation) public deallocations; // deallocation id => Deallocation
  uint public firstDeallocation;
  uint public deallocationCount;

  uint public processedToStakerIndex; // we processed the action up this staker
  uint public processedToContractIndex; // we processed the action up this contract

  event ActionStatus(bool finished);

  function initialize(address masterAddress, address tokenAddress) public initializer {
    MasterAware.initialize(masterAddress);
    TokenAware.initialize(tokenAddress);
  }

  /* getters */

  function contractStakerCount(address contractAddress) public view returns (uint) {
    return contracts[contractAddress].stakers.length;
  }

  function contractStakerAtIndex(address contractAddress, uint stakerIndex) public view returns (address) {
    return contracts[contractAddress].stakers[stakerIndex];
  }

  function stakerContractCount(address staker) public view returns (uint) {
    return stakers[staker].contracts.length;
  }

  function stakerContractAtIndex(address staker, uint contractIndex) public view returns (address) {
    return stakers[staker].contracts[contractIndex];
  }

  function stakerContractAllocation(address staker, address contractAddress) public view returns (uint) {
    return stakers[staker].allocations[contractAddress];
  }

  function deallocationAtIndex(uint deallocationId) public view returns (
    uint amount, uint deallocateAt, address contractAddress, address stakerAddress, uint next
  ) {
    Deallocation storage deallocation = deallocations[deallocationId];
    amount = deallocation.amount;
    deallocateAt = deallocation.deallocateAt;
    contractAddress = deallocation.contractAddress;
    stakerAddress = deallocation.stakerAddress;
    next = deallocation.next; // next deallocation id in linked list
  }

  function getMaxUnstakable(address stakerAddress) public view returns (uint) {

    Staker storage staker = stakers[stakerAddress];

    uint maxAllocation = 0;
    uint totalAllocation = 0;

    for (uint i = 0; i < staker.contracts.length; i++) {
      address contractAddress = staker.contracts[i];
      uint allocation = staker.allocations[contractAddress];
      totalAllocation = totalAllocation.add(allocation);
      maxAllocation = allocation > maxAllocation ? allocation : maxAllocation;
    }

    uint minRequiredStake = totalAllocation.div(MAX_LEVERAGE);
    uint unusedLeverage = staker.staked.sub(minRequiredStake);
    uint minUnusedAllocation = staker.staked.sub(maxAllocation);
    uint safelyUnstakable = unusedLeverage < minUnusedAllocation ? unusedLeverage : minUnusedAllocation;

    return safelyUnstakable;
  }

  /* staking functions */

  function stake(
    uint amount,
    address[] calldata _contracts,
    uint[] calldata _allocations
  ) external onlyMembers {

    Staker storage staker = stakers[msg.sender];

    require(
      _contracts.length >= staker.contracts.length,
      "Allocating to fewer contracts is not allowed"
    );

    require(
      _contracts.length == _allocations.length,
      "Contracts and allocations arrays should have the same length"
    );

    Vault.deposit(token, msg.sender, amount);
    staker.staked = staker.staked.add(amount);

    uint oldLength = staker.contracts.length;
    uint totalAllocation;

    for (uint i = 0; i < _contracts.length; i++) {

      address contractAddress = _contracts[i];
      uint oldAllocation = staker.allocations[contractAddress];
      uint newAllocation = _allocations[i];
      bool isNewAllocation = i >= oldLength;

      totalAllocation = totalAllocation.add(newAllocation);

      require(newAllocation >= MIN_ALLOCATION, "Allocation minimum not met");
      require(newAllocation <= staker.staked, "Cannot allocate more than staked");

      if (!isNewAllocation) {
        require(contractAddress == staker.contracts[i], "Unexpected contract order");
        require(oldAllocation <= newAllocation, "New allocation is less than previous allocation");
      }

      if (staker.allocations[contractAddress] == newAllocation) {
        // no changes to this contract
        continue;
      }

      if (isNewAllocation) {
        staker.contracts.push(contractAddress);
        contracts[contractAddress].stakers.push(msg.sender);
      }

      staker.allocations[contractAddress] = newAllocation;
      contracts[contractAddress].staked = contracts[contractAddress]
        .staked
        .sub(oldAllocation)
        .add(newAllocation);
    }

    require(
      totalAllocation <= staker.staked.mul(MAX_LEVERAGE),
      "Total allocation exceeds maximum allowed"
    );
  }

  function unstake(uint amount) external onlyMembers {
    uint unstakable = getMaxUnstakable(msg.sender);
    require(unstakable >= amount, "Requested amount exceeds max unstakable amount");
    stakers[msg.sender].staked = stakers[msg.sender].staked.sub(amount);
  }

  function requestDeallocation(
    address[] calldata _contracts,
    uint[] calldata _amounts,
    uint _insertAfter // deallocation id to insert the new deallocations after
  ) external onlyMembers {

    require(
      _contracts.length == _amounts.length,
      "Contracts and amounts arrays should have the same length"
    );

    Staker storage staker = stakers[msg.sender];
    uint insertAfter = _insertAfter;

    for (uint i = 0; i < _contracts.length; i++) {

      address contractAddress = _contracts[i];
      uint allocated = staker.allocations[contractAddress];
      uint pendingDeallocation = staker.pendingDeallocations[contractAddress];
      uint requested = _amounts[i];
      uint max = pendingDeallocation > allocated ? 0 : allocated.sub(pendingDeallocation);

      require(max > 0, "Nothing to deallocate on this contract");

      // To prevent spam, Small stakes and deallocations are not allowed
      // However, we allow the user to deallocate the entire amount
      if (requested != max) {
        require(requested >= MIN_ALLOWED_DEALLOCATION, "Deallocation cannot be less then MIN_ALLOWED_DEALLOCATION");
        require(requested <= max, "Cannot deallocate more than allocated");
        require(max.sub(requested) >= MIN_ALLOCATION, "Final allocation cannot be less then MIN_ALLOCATION");
      }

      uint deallocateAt = now.add(DEALLOCATE_LOCK_TIME);

      // fetch request currently at target index
      Deallocation storage current = deallocations[insertAfter];
      require(
        deallocateAt >= current.deallocateAt,
        "Deallocation time must be greater or equal to previous deallocation"
      );

      if (current.next != 0) {
        Deallocation storage next = deallocations[current.next];
        // next deallocation time should be greater than new deallocation time
        require(
          next.deallocateAt > deallocateAt,
          "Deallocation time must be smaller than next deallocation"
        );
      }

      // get next available id
      uint id = deallocationCount;
      deallocationCount++;

      uint next = current.next;

      // point to our new deallocation
      current.next = id;

      // insert next item after this one
      insertAfter = id;

      deallocations[id] = Deallocation(
        requested, deallocateAt, contractAddress, msg.sender, next
      );

      // increase pending deallocation amount so we keep track of final allocation
      uint newPending = staker.pendingDeallocations[contractAddress].add(requested);
      staker.pendingDeallocations[contractAddress] = newPending;
    }
  }

  function pushBurn(address contractAddress, uint amount) external onlyInternal {

    Contract storage _contract = contracts[contractAddress];
    require(amount <= _contract.staked, 'Burn amount should not exceed total amount staked on contract');

    // add new burn
    burns[burnCount] = Burn(amount, now, contractAddress, 0);

    // do we have a previous unprocessed burn?
    bool previousExists = burnCount > 0 && burns[burnCount - 1].burnedAt > 0;

    if (previousExists) {
      // set previousBurn.next to current burn id
      burns[burnCount - 1].next = burnCount;
    } else {
      // otherwise this is the only unprocessed burn and it should be the first one
      firstBurn = burnCount;
    }

    // update counter
    ++burnCount;
  }

  function pushReward(address contractAddress, uint amount, address from) external onlyInternal {

    // transfer tokens from specified contract to us
    // token transfer should be approved by the specified address
    Vault.deposit(token, from, amount);

    // add new reward
    rewards[rewardCount] = Reward(amount, now, contractAddress, 0);

    // do we have a previous unprocessed reward?
    bool previousExists = rewardCount > 0 && rewards[rewardCount - 1].rewardedAt > 0;

    if (previousExists) {
      // set previousReward.next to current reward id
      rewards[rewardCount - 1].next = rewardCount;
    } else {
      // otherwise this is the only unprocessed reward and it should be the first one
      firstReward = rewardCount;
    }

    // update counter
    ++rewardCount;
  }

  function hasPendingActions() public view returns (bool) {
    return hasPendingBurns() || hasPendingDeallocations() || hasPendingRewards();
  }

  function processPendingActions() public {

    while (true) {

      Burn storage burn = burns[firstBurn];
      Deallocation storage deallocation = deallocations[firstDeallocation];
      Reward storage reward = rewards[firstReward];

      bool canBurn = burn.burnedAt != 0;
      bool canDeallocate = deallocation.deallocateAt != 0 && deallocation.deallocateAt <= now;
      bool canReward = reward.rewardedAt != 0;

      if (!canBurn && !canDeallocate && !canReward) {
        // everything is processed
        break;
      }

      if (
        canBurn &&
        (!canDeallocate || burn.burnedAt < deallocation.deallocateAt) &&
        (!canReward || burn.burnedAt < reward.rewardedAt)
      ) {

        // O(n*m)
        if (!_processFirstBurn()) {
          emit ActionStatus(false);
          return;
        }

        continue;
      }

      if (
        canDeallocate &&
        (!canReward || deallocation.deallocateAt < reward.rewardedAt)
      ) {

        // deallocation gas limit check here
//        uint gas = gasleft();
//        gas = gas - gasleft();
//        emit ActionStatus(true);

        // O(1)
        _processFirstDeallocation();
        continue;
      }

      // O(n)
      if (!_processFirstReward(reward)) {
        emit ActionStatus(false);
        return;
      }
    }

    // everything is processed!
    emit ActionStatus(true);
  }

  function hasPendingBurns() public view returns (bool) {
    return burns[firstBurn].burnedAt != 0;
  }

  function _processFirstBurn() internal returns (bool) {

    Burn storage burn = burns[firstBurn];
    address contractAddress = burn.contractAddress;
    Contract storage _contract = contracts[contractAddress];

    uint stakerCount = _contract.stakers.length;
    uint burned = 0;

    for (uint i = processedToStakerIndex; i < stakerCount; i++) {

      Staker storage staker = stakers[_contract.stakers[i]];
      uint oldAllocation = staker.allocations[contractAddress];

      // formula: staker_burn = staker_allocation / total_contract_stake * contract_burn
      // reordered for precision loss prevention
      uint stakerBurn = oldAllocation.mul(burn.amount).div(_contract.staked);
      uint newStake = staker.staked.sub(stakerBurn);
      burned = burned.add(stakerBurn);

      // update staker's stake and allocation
      staker.staked = newStake;
      staker.allocations[contractAddress] = oldAllocation.sub(stakerBurn);

      uint contractCount = staker.contracts.length;

      // if needed, reduce stakes for other contracts
      for (uint j = processedToContractIndex; j < contractCount; j++) {

        address _staker_contract = staker.contracts[j];
        uint prevAllocation = staker.allocations[_staker_contract];

        // can't have allocated more than staked
        // branch won't be executed for the burned contract since we updated the allocation earlier
        if (prevAllocation > newStake) {
          staker.allocations[_staker_contract] = newStake;
          uint stakeDiff = prevAllocation.sub(newStake);
          contracts[_staker_contract].staked = contracts[_staker_contract].staked.sub(stakeDiff);
        }

        // cycles left but gas is low
        // recommended BURN_CYCLE_GAS_LIMIT = ?
        if (j + 1 < contractCount && gasleft() < BURN_CYCLE_GAS_LIMIT) {
          _contract.staked = _contract.staked.sub(burned);
          processedToContractIndex = j + 1;
          return false;
        }
      }

      processedToContractIndex = 0;

      if (i + 1 < stakerCount && gasleft() < BURN_CYCLE_GAS_LIMIT) {
        _contract.staked = _contract.staked.sub(burned);
        processedToStakerIndex = i + 1;
        return false;
      }
    }

    processedToStakerIndex = 0;
    _contract.staked = _contract.staked.sub(burned);

    uint nextBurn = burn.next;
    delete burns[firstBurn];
    firstBurn = nextBurn;

    return true;
  }

  function hasPendingDeallocations() public view returns (bool){
    return deallocations[firstDeallocation].deallocateAt != 0;
  }

  function _processFirstDeallocation() internal {
    Deallocation storage deallocation = deallocations[firstDeallocation];
    Staker storage staker = stakers[deallocation.stakerAddress];

    address contractAddress = deallocation.contractAddress;
    uint allocation = staker.allocations[contractAddress];
    allocation = deallocation.amount >= allocation ? 0 : allocation.sub(deallocation.amount);

    staker.allocations[contractAddress] = allocation;
    staker.pendingDeallocations[contractAddress].sub(deallocation.amount);

    uint nextDeallocation = deallocation.next;
    delete deallocations[firstDeallocation];
    firstDeallocation = nextDeallocation;
  }

  function hasPendingRewards() public view returns (bool){
    return rewards[firstReward].rewardedAt != 0;
  }

  function _processFirstReward(Reward storage reward) internal returns (bool) {

    address contractAddress = reward.contractAddress;
    Contract storage _contract = contracts[contractAddress];
    uint stakerCount = _contract.stakers.length;

    // ~27000 gas each cycle
    for (uint i = processedToStakerIndex; i < stakerCount; i++) {

      Staker storage staker = stakers[_contract.stakers[i]];
      uint allocation = staker.allocations[contractAddress];

      // staker's ratio = total staked on contract / staker's stake on contract
      // staker's reward = total reward amount * staker's ratio
      uint stakerReward = reward.amount.mul(allocation).div(_contract.staked);
      staker.reward = staker.reward.add(stakerReward);

      uint nextIndex = i + 1;

      // cycles left but gas is low
      // recommended REWARD_CYCLE_GAS_LIMIT = 45000
      if (nextIndex < stakerCount && gasleft() < REWARD_CYCLE_GAS_LIMIT) {
        processedToStakerIndex = nextIndex;
        return false;
      }
    }

    uint nextReward = reward.next;
    delete rewards[firstReward];
    firstReward = nextReward;
    processedToStakerIndex = 0;

    return true;
  }

  function withdrawReward(uint amount) external onlyMembers {

    require(
      stakers[msg.sender].reward >= amount,
      "Requested withdraw amount exceeds available reward"
    );

    stakers[msg.sender].reward = stakers[msg.sender].reward.sub(amount);
    Vault.withdraw(token, msg.sender, amount);
  }

  function updateParameter(ParamType param, uint value) external onlyGoverned {

    if (param == ParamType.MIN_ALLOCATION) {
      MIN_ALLOCATION = value;
      return;
    }

    if (param == ParamType.MAX_LEVERAGE) {
      MAX_LEVERAGE = value;
      return;
    }

    if (param == ParamType.MIN_ALLOWED_DEALLOCATION) {
      MIN_ALLOWED_DEALLOCATION = value;
      return;
    }

    if (param == ParamType.DEALLOCATE_LOCK_TIME) {
      DEALLOCATE_LOCK_TIME = value;
      return;
    }

    if (param == ParamType.BURN_CYCLE_GAS_LIMIT) {
      BURN_CYCLE_GAS_LIMIT = value;
      return;
    }

    if (param == ParamType.DEALLOCATION_CYCLE_GAS_LIMIT) {
      DEALLOCATION_CYCLE_GAS_LIMIT = value;
      return;
    }

    if (param == ParamType.REWARD_CYCLE_GAS_LIMIT ) {
      REWARD_CYCLE_GAS_LIMIT = value;
      return;
    }
  }
}
