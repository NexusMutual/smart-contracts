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
    MIN_STAKE,
    MAX_LEVERAGE,
    MIN_ALLOWED_DEALLOCATION,
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

  struct Contract {
    uint staked; // amount of nxm staked for this contract
    // TODO: find a way to remove zero-amount stakers. Linked list?
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

  uint public MIN_STAKE;                // Minimum allowed stake per contract
  uint public MAX_LEVERAGE;             // Stakes sum must be less than the deposited amount times this
  uint public MIN_ALLOWED_DEALLOCATION; // Forbid deallocation of small amounts to prevent spam
  uint public DEALLOCATE_LOCK_TIME;     // Lock period before unstaking takes place

  // List of all contract addresses
  address[] public contractAddresses;

  mapping(address => Staker) public stakers;     // stakerAddress => Staker
  mapping(address => Contract) public contracts; // contractAddress => Contract

  mapping(uint => Burn) public burns; // burn id => Burn
  uint public firstBurn; // linked list head element
  uint public burnCount; // used for getting next available id

  mapping(uint => Reward) public rewards; // reward id => Reward
  uint public firstReward;
  uint public rewardCount;

  mapping(uint => Deallocation) public deallocations; // deallocation id => Deallocation
  uint public firstDeallocation;
  uint public deallocationCount;

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

    uint stake = staker.staked;
    uint available = stake;

    for (uint i = 0; i < staker.contracts.length; i++) {
      address contractAddress = staker.contracts[i];
      uint allocation = staker.allocations[contractAddress];
      uint left = stake.sub(allocation);
      available = left < available ? left : available;
    }

    return available;
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

      require(newAllocation >= MIN_STAKE, "Allocation minimum not met");
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
        require(max.sub(requested) >= MIN_STAKE, "Final allocation cannot be less then MIN_STAKE");
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

  function processPendingActions() public returns (bool) {

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
        _processFirstBurn();
        continue;
      }

      if (
        canDeallocate &&
        (!canReward || deallocation.deallocateAt < reward.rewardedAt)
      ) {
        // O(1)
        _processFirstDeallocation();
        continue;
      }

      // O(n)
      _processFirstReward();

      // TODO: check if there's enough gas for the next iteration
      // TODO: probably should implement this in _processFirst* functions
      // TODO: run simulations to find a proper value
      if (gasleft() < 20 szabo) { // 20k gwei
        return false;
      }
    }

    return true;
  }

  function _processFirstBurn() internal {

    Burn storage burn = burns[firstBurn];
    Contract storage _contract = contracts[burn.contractAddress];
    address contractAddress = burn.contractAddress;

    uint burnAmount = burn.amount <= _contract.staked ? burn.amount : _contract.staked;
    uint burned = 0;
    uint newContractStake = 0;

    for (uint i = 0; i < _contract.stakers.length; i++) {

      Staker storage staker = stakers[_contract.stakers[i]];

      uint oldAllocation = staker.allocations[contractAddress];

      // formula: staker_burn = staker_allocation / total_contract_stake * contract_burn
      // reordered for precision loss prevention
      uint stakerBurn = oldAllocation.mul(burnAmount).div(_contract.staked);
      uint newStake = staker.staked.sub(stakerBurn);
      staker.allocations[contractAddress] = oldAllocation.sub(stakerBurn);

      // reduce other contracts' stakes if needed
      for (uint j = 0; j < staker.contracts.length; j++) {

        address _staker_contract = staker.contracts[j];
        uint prevAllocation = staker.allocations[_staker_contract];

        if (prevAllocation > newStake) {
          staker.allocations[_staker_contract] = newStake;
          uint prevContractStake = contracts[_staker_contract].staked;
          contracts[_staker_contract].staked = prevContractStake.sub(prevAllocation).add(newStake);
        }
      }

      burned = burned.add(stakerBurn);
      newContractStake = newContractStake.add(stakerBurn);
      staker.staked = newStake;
    }

    // TODO: check for rounding issues
    require(burnAmount == burned, "Burn amount mismatch");

    _contract.staked = _contract.staked.sub(burnAmount).add(newContractStake);
    Vault.burn(token, burnAmount);

    uint nextBurn = burn.next;
    delete burns[firstBurn];
    firstBurn = nextBurn;
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

  function _processFirstReward() internal {

    Reward storage reward = rewards[firstReward];
    address contractAddress = reward.contractAddress;
    Contract storage _contract = contracts[contractAddress];
    uint rewarded = 0;

    for (uint i = 0; i < _contract.stakers.length; i++) {

      Staker storage staker = stakers[_contract.stakers[i]];
      uint allocation = staker.allocations[contractAddress];

      // staker's ratio = total staked on contract / staker's stake on contract
      // staker's reward = total reward amount * staker's ratio
      uint stakerReward = reward.amount.mul(allocation).div(_contract.staked);

      staker.reward = staker.reward.add(stakerReward);
      rewarded = rewarded.add(stakerReward);
    }

    uint nextReward = reward.next;
    delete rewards[firstReward];
    firstReward = nextReward;

//     require(rewarded <= reward.amount, "Reward amount mismatch");
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

    if (param == ParamType.MIN_STAKE) {
      MIN_STAKE = value;
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
  }
}
