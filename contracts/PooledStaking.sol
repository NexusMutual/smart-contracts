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

contract PooledStaking is MasterAware {
  using SafeMath for uint;

  enum ParamType {
    MIN_DEPOSIT_AMOUNT,
    MIN_STAKE_PERCENTAGE,
    MAX_LEVERAGE,
    UNSTAKE_LOCK_TIME
  }

  // Minimum deposit
  uint public MIN_DEPOSIT_AMOUNT;

  // Minimum allowed stake percentage per contract
  uint public MIN_STAKE_PERCENTAGE;

  // Sum of all stakes should not exceed the total deposited amount times this number
  uint public MAX_LEVERAGE;

  // Lock period before unstaking takes place
  uint public UNSTAKE_LOCK_TIME;

  struct Staker {
    uint staked; // total amount of staked nxm
    uint reward; // total amount that is ready to be claimed
    address[] contracts; // list of contracts the staker has staked on

    // Percentage of staked NXM amount on a contract
    // All percentages have 2 decimal places, i.e. 100% is represented as 10000, and 33.33% as 3333
    mapping(address => uint) allocations;

    // amount to be subtracted after all deallocations will be processed
    mapping(address => uint) deallocationAmounts;

    // pending deallocations
    mapping(address => uint[]) pendingDeallocationIds;
  }

  struct Contract {
    uint staked; // amount of nxm staked for this contract
    address[] stakers; // used for iteration
  }

  struct DeallocationRequest {
    address contractAddress;
    address stakerAddress;
    uint amount;
    uint deallocateAt;
  }

  // List of all contract addresses
  address[] public contractAddresses;

  // List of all staker addresses
  // address[] public stakerAddress;

  // stakers mapping. stakerAddress => Staker
  mapping(address => Staker) public stakers;

  // contracts mapping. contractAddress => Staker
  mapping(address => Contract) public contracts;

  // deallocation requests mapping. contractAddress => Staker
  mapping(address => DeallocationRequest) public deallocationRequests;

  uint firstDeallocation;
  uint lastDeallocation;

  function initialize(address masterAddress) initializer public {
    MasterAware.initialize(masterAddress);
  }

  function stake(uint amount) onlyMembers external {

    require(amount > MIN_DEPOSIT_AMOUNT, "Amount is less than minimum allowed");

    Staker storage staker = stakers[msg.sender];
    uint oldStake = staker.staked;
    staker.staked = staker.staked.add(amount);

    for (uint i = 0; i < staker.contracts.length; i++) {
      address contractAddress = staker.contracts[i];
      uint allocation = staker.allocations[contractAddress];

      uint oldAmount = oldStake.mul(allocation).div(10000);
      uint newAmount = staker.staked.mul(allocation).div(10000);

      contracts[contractAddress].staked = contracts[contractAddress].staked
      .sub(oldAmount)
      .add(newAmount);
    }
  }

  function setAllocations(address[] calldata _contracts, uint[] calldata _allocations) onlyMembers external {

    Staker storage staker = stakers[msg.sender];

    require(
      _contracts.length >= staker.contracts.length,
      "Allocating to fewer contracts is not allowed"
    );

    uint previousLength = staker.contracts.length;
    uint allocationTotal;

    for (uint i = 0; i < _contracts.length; i++) {

      require(_allocations[i] >= MIN_STAKE_PERCENTAGE, "Allocation minimum not met");
      require(_allocations[i] <= 10000, "Cannot allocate more than 100% per contract");

      address contractAddress = _contracts[i];
      uint oldAllocation = staker.allocations[contractAddress];

      if (i < previousLength) {
        // we expect new contracts to be at the end
        require(contractAddress == staker.contracts[i], "Unexpected contract");
        require(oldAllocation <= _allocations[i], "New allocation is less than previous allocation");
      } else {
        staker.contracts.push(contractAddress);
        contracts[contractAddress].stakers.push(msg.sender);
      }

      allocationTotal = allocationTotal.add(_allocations[i]);
      uint oldAmount = staker.staked.mul(oldAllocation).div(10000);
      uint newAmount = staker.staked.mul(_allocations[i]).div(10000);

      staker.allocations[contractAddress] = _allocations[i];
      contracts[contractAddress].staked = contracts[contractAddress]
      .staked
      .sub(oldAmount)
      .add(newAmount);
    }

    require(allocationTotal <= MAX_LEVERAGE, "Total allocation exceeds maximum allowed");
  }

  function requestDeallocation(address contractAddress, uint amount) external onlyMembers {

    Staker storage staker = stakers[msg.sender];
    uint allowed = staker.allocations[contractAddress];

    allowed;

    require(
      stakers[msg.sender].allocations[contractAddress] >= amount,
      "Unable to deallocate more than allocated"
    );

    revert("NOT IMPLEMENTED");
  }

  function burn(address contractAddress, uint amount) onlyInternal external {
    contractAddress;
    amount;
    revert("NOT IMPLEMENTED");
  }

  function reward(address contractAddress, uint amount) onlyInternal external {
    contractAddress;
    amount;
    revert("NOT IMPLEMENTED");
  }

  function deallocate(address contractAddress, uint amount) onlyInternal public {
    contractAddress;
    amount;
    revert("NOT IMPLEMENTED");
  }

  function updateParameter(ParamType param, uint value) onlyGoverned external {

    if (param == ParamType.MIN_DEPOSIT_AMOUNT) {
      MIN_DEPOSIT_AMOUNT = value;
      return;
    }

    if (param == ParamType.MIN_STAKE_PERCENTAGE) {
      MIN_STAKE_PERCENTAGE = value;
      return;
    }

    if (param == ParamType.MAX_LEVERAGE) {
      MAX_LEVERAGE = value;
      return;
    }

    if (param == ParamType.UNSTAKE_LOCK_TIME) {
      UNSTAKE_LOCK_TIME = value;
      return;
    }
  }
}
