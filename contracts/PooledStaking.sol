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
    MIN_DEPOSIT_AMOUNT, // might want to nuke this
    MIN_STAKE,
    MAX_LEVERAGE,
    DEALLOCATE_LOCK_TIME
  }

  struct Staker {
    uint staked; // total amount of staked nxm
    uint reward; // total amount that is ready to be claimed
    address[] contracts; // list of contracts the staker has staked on

    mapping(address => uint) allocations;

    // amount to be subtracted after all deallocations will be processed
    mapping(address => uint) pendingDeallocations;
  }

  struct Contract {
    uint staked; // amount of nxm staked for this contract
    // TODO: find a way to remove zero-amount stakers. Linked list?
    address[] stakers; // used for iteration
  }

  struct DeallocationRequest {
    uint next; // id of the next deallocation request in the linked list
    uint amount;
    uint deallocateAt;
    address stakerAddress;
  }

  uint public MIN_DEPOSIT_AMOUNT;   // Minimum deposit. Considered for removal.
  uint public MIN_STAKE;            // Minimum allowed stake per contract
  uint public MAX_LEVERAGE;         // Sum of all stakes should not exceed the total deposited amount times this number
  uint public DEALLOCATE_LOCK_TIME; // Lock period before unstaking takes place

  // List of all contract addresses
  address[] public contractAddresses;

  // stakers mapping. stakerAddress => Staker
  mapping(address => Staker) public stakers;

  // contracts mapping. contractAddress => Staker
  mapping(address => Contract) public contracts;

  // deallocation requests mapping
  // contractAddress => deallocation id => deallocation
  mapping(address => mapping(uint => DeallocationRequest)) public deallocationRequests;

  mapping(address => uint) firstDeallocationRequest; // linked list head element
  mapping(address => uint) deallocationRequestCount; // used for getting next available id

  function initialize(address masterAddress, address tokenAddress) initializer public {
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

  function deallocationRequestAtIndex(
    address contractAddress, uint deallocationId
  ) public view returns (
    uint next, uint amount, uint deallocateAt, address stakerAddress
  ) {
    DeallocationRequest storage deallocation = deallocationRequests[contractAddress][deallocationId];
    next = deallocation.next;
    // next deallocation id in linked list
    amount = deallocation.amount;
    deallocateAt = deallocation.deallocateAt;
    stakerAddress = deallocation.stakerAddress;
  }

  function getMaxUnstakable(address stakerAddress) view public returns (uint) {

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
  ) onlyMembers external {

    // considering to remove this in favor of MIN_STAKE
    require(amount > MIN_DEPOSIT_AMOUNT, "Amount is less than minimum allowed");

    require(
      _contracts.length >= staker.contracts.length,
      "Allocating to fewer contracts is not allowed"
    );

    require(
      _contracts.length == _allocations.length,
      "Contracts and allocations arrays should have the same length"
    );

    require(
      staker.staked > 0,
      "Allocations can be set only when staked amount is non-zero"
    );

    Vault.deposit(token, msg.sender, amount);

    Staker storage staker = stakers[msg.sender];
    uint oldStake = staker.staked;
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
      require(newAllocation <= staker.staked, "Cannot allocate more than 100% per contract");

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

    require(totalAllocation <= MAX_LEVERAGE, "Total allocation exceeds maximum allowed");
  }

  function unstake(uint amount) onlyMembers external {

    uint unstakable = getMaxUnstakable(msg.sender);

    require(unstakable >= amount, "Requested amount exceeds max unstakable amount");

    Staker storage staker = stakers[msg.sender];
    uint oldStake = staker.staked;
    staker.staked = staker.staked.sub(amount);
  }

  function requestDeallocation(
    address[] calldata _contracts,
    uint[] calldata _amounts,
    uint[] calldata _insertAfter // deallocation ids to insert deallocation at
  ) onlyMembers external {

    require(
      _contracts.length == _amounts.length,
      "Contracts and amounts arrays should have the same length"
    );

    require(
      _contracts.length == _insertAfter.length,
      "Contracts and _insertAfter arrays should have the same length"
    );

    Staker storage staker = stakers[msg.sender];

    for (uint i = 0; i < _contracts.length; i++) {

      address contractAddress = _contracts[i];
      uint allocated = staker.allocations[contractAddress];
      uint pendingDeallocation = staker.pendingDeallocations[contractAddress];
      uint requested = _amounts[i];

      require(
        allocated.sub(pendingDeallocation).sub(requested) >= MIN_STAKE,
        "Final allocation cannot be less then MIN_STAKE"
      );

      uint deallocateAt = now.add(DEALLOCATE_LOCK_TIME);
      uint insertAfter = _insertAfter[i];

      // fetch request currently at target index
      DeallocationRequest storage current = deallocationRequests[contractAddress][insertAfter];
      require(
        deallocateAt >= current.deallocateAt,
        "Deallocation time must be greater or equal to previous deallocation"
      );

      if (current.next != 0) {
        DeallocationRequest storage next = deallocationRequests[contractAddress][current.next];
        require(
        // require its deallocation time to be greater than new deallocation time
          next.deallocateAt > deallocateAt,
          "Deallocation time must be smaller than next deallocation"
        );
      }

      // get next available id
      uint id = deallocationRequestCount[contractAddress];
      deallocationRequestCount[contractAddress]++;

      // point to our new deallocation
      uint next = current.next;
      current.next = id;

      deallocationRequests[contractAddress][id] = DeallocationRequest(
        next, requested, deallocateAt, msg.sender
      );

      // increase pending deallocation amount so we keep track of final allocation
      uint newPending = staker.pendingDeallocations[contractAddress].add(requested);
      staker.pendingDeallocations[contractAddress] = newPending;
    }
  }

  function processDeallocations(address contractAddress) public {

    while (true) {

      uint first = firstDeallocationRequest[contractAddress];
      DeallocationRequest storage deallocation = deallocationRequests[contractAddress][first];

      // deallocation deadline not met yet or list end reached
      if (deallocation.deallocateAt == 0 || now < deallocation.deallocateAt) {
        break;
      }

      Staker storage staker = stakers[deallocation.stakerAddress];

      staker.allocations[contractAddress].sub(deallocation.amount);
      staker.pendingDeallocations[contractAddress].add(deallocation.amount);

      delete deallocationRequests[contractAddress][first];
      firstDeallocationRequest[contractAddress] = deallocation.next;
    }
  }

  function burn(address contractAddress, uint totalBurnAmount) internal {

    Contract storage _contract = contracts[contractAddress];

    uint burned = 0;
    uint newContractStake = 0;

    require(totalBurnAmount > _contract.staked, "Cannot burn more than staked");

    for (uint i = 0; i < _contract.stakers.length; i++) {

      Staker storage staker = stakers[_contract.stakers[i]];

      uint allocation = staker.allocations[contractAddress];

      // formula: staker_burn = staker_allocation / total_contract_stake * contract_burn
      // reordered for precision loss prevention
      uint stakerBurn = allocation.mul(totalBurnAmount).div(_contract.staked);
      uint newStake = staker.staked.sub(stakerBurn);

      // reduce other contracts' stakes if needed
      for (uint j = 0; j < staker.contracts; j++) {

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
    require(totalBurnAmount == burned, "Burn amount mismatch");

    _contract.staked = _contract.staked.sub(totalBurnAmount).add(newContractStake);
    Vault.burn(token, totalBurnAmount);
  }

  function reward(address contractAddress, address from, uint amount) internal {

    // transfer tokens from specified contract to us
    // token transfer should be approved by the specified address
    Vault.deposit(token, from, amount);

    Contract storage _contract = contracts[contractAddress];
    uint rewarded = 0;

    for (uint i = 0; i < _contract.stakers.length; i++) {

      Staker storage staker = stakers[_contract.stakers[i]];

      uint allocation = staker.allocations[contractAddress];
      uint exposedAmount = staker.staked.mul(allocation).div(10000);

      // staker's share = total staked on contract / staker's stake on contract
      // staker's reward = total reward amount * staker's share
      uint stakerReward = amount.mul(exposedAmount).div(_contract.staked);

      staker.reward = staker.reward.add(stakerReward);
      rewarded = rewarded.add(stakerReward);
    }

    require(rewarded <= amount, "Reward amount mismatch");
  }

  function withdrawReward(uint amount) onlyMembers external {

    require(
      stakers[msg.sender].reward >= amount,
      "Requested withdraw amount exceeds available reward"
    );

    Staker storage staker = stakers[msg.sender];
    staker.reward = staker.reward.sub(amount);
    Vault.withdraw(token, msg.sender, amount);
  }

  function updateParameter(ParamType param, uint value) onlyGoverned external {

    if (param == ParamType.MIN_DEPOSIT_AMOUNT) {
      MIN_DEPOSIT_AMOUNT = value;
      return;
    }

    if (param == ParamType.MIN_STAKE) {
      MIN_STAKE = value;
      return;
    }

    if (param == ParamType.MAX_LEVERAGE) {
      MAX_LEVERAGE = value;
      return;
    }

    if (param == ParamType.DEALLOCATE_LOCK_TIME) {
      DEALLOCATE_LOCK_TIME = value;
      return;
    }
  }
}
