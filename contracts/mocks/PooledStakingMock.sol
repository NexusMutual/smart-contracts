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

import "../interfaces/MasterAware.sol";
import "../NXMToken.sol";
import "../TokenController.sol";
import "../Governance.sol";
import "../external/openzeppelin-solidity/math/SafeMath.sol";

contract PooledStakingMock is MasterAware {
    using SafeMath for uint;

    /* Data types */

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
    event Burned(address indexed contractAddress, uint amount);

    // rewards
    event Rewarded(address indexed contractAddress, uint amount);
    event RewardWithdrawn(address indexed staker, uint amount);

    // pending actions processing
    event PendingActionsProcessed(bool finished);

    /* Storage variables */

    bool public initialized;

    NXMToken public token;
    TokenController public tokenController;

    uint public MIN_ALLOCATION;           // Minimum allowed stake per contract
    uint public MAX_LEVERAGE;             // Stakes sum must be less than the deposited amount times this
    uint public MIN_ALLOWED_DEALLOCATION; // Forbid deallocation of small amounts to prevent spam
    uint public DEALLOCATE_LOCK_TIME;     // Lock period in seconds before unstaking takes place
    uint public BURN_CYCLE_GAS_LIMIT;
    uint public DEALLOCATION_CYCLE_GAS_LIMIT;
    uint public REWARD_CYCLE_GAS_LIMIT;

    // List of all coverable contract addresses
    address[] public contractAddresses;

    mapping(address => Staker) public stakers;     // stakerAddress => Staker
    mapping(address => Contract) public contracts; // contractAddress => Contract

    mapping(uint => Burn) public burns; // burn id => Burn
    uint public firstBurn; // id of the first burn to process. zero if there are no unprocessed burns
    uint public lastBurnId;

    mapping(uint => Reward) public rewards; // reward id => Reward
    uint public firstReward;
    uint public lastRewardId;

    mapping(uint => Deallocation) public deallocations; // deallocation id => Deallocation
    // firstDeallocation is stored at deallocations[0].next
    uint public lastDeallocationId;

    uint public processedToStakerIndex; // we processed the action up this staker
    uint public processedToContractIndex; // we processed the action up this contract

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
        return contracts[contractAddress].stakers.length;
    }

    function contractStakerAtIndex(address contractAddress, uint stakerIndex) public view returns (address) {
        return contracts[contractAddress].stakers[stakerIndex];
    }

    function contractStake(address contractAddress) public view returns (uint) {
        return contracts[contractAddress].staked;
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

        if (firstBurn == 0) {
            return staker.staked;
        }

        Burn storage burn = burns[firstBurn];
        address contractAddress = burn.contractAddress;

        uint totalContractStake = contracts[contractAddress].staked;
        uint allocation = staker.allocations[contractAddress];
        uint stakerBurn = allocation.mul(burn.amount).div(totalContractStake);
        uint newStake = staker.staked.sub(stakerBurn);

        return newStake;
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
    uint totalAllocated;
    uint maxAllocation;

        for (uint i = 0; i < staker.contracts.length; i++) {
            address contractAddress = staker.contracts[i];
            uint allocation = staker.allocations[contractAddress];
      totalAllocated = totalAllocated.add(allocation);

      if (maxAllocation < allocation) {
        maxAllocation = allocation;
      }
        }

    uint minRequired = totalAllocated.div(MAX_LEVERAGE);
    uint locked = maxAllocation > minRequired ? maxAllocation : minRequired;

    return staker.staked.sub(locked);
    }

    function hasPendingActions() public view returns (bool) {
        return hasPendingBurns() || hasPendingDeallocations() || hasPendingRewards();
    }

    function hasPendingBurns() public view returns (bool) {
        return burns[firstBurn].burnedAt != 0;
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

        require(
            _contracts.length >= staker.contracts.length,
            "Allocating to fewer contracts is not allowed"
        );

        require(
            _contracts.length == _allocations.length,
            "Contracts and allocations arrays should have the same length"
        );

        token.transferFrom(msg.sender, address(this), amount);

        staker.staked = staker.staked.add(amount);

        uint oldLength = staker.contracts.length;
        uint totalAllocation;

        for (uint i = 0; i < _contracts.length; i++) {

            address contractAddress = _contracts[i];
            uint oldAllocation = staker.allocations[contractAddress];
            uint newAllocation = _allocations[i];
            bool isNewAllocation = i >= oldLength;

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

            totalAllocation = totalAllocation.add(newAllocation);
            uint increase = newAllocation.sub(oldAllocation);

            staker.allocations[contractAddress] = newAllocation;
            contracts[contractAddress].staked = contracts[contractAddress].staked.add(increase);

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
        uint insertAfter = _insertAfter;
        uint deallocateAt = now.add(DEALLOCATE_LOCK_TIME);

        for (uint i = 0; i < _contracts.length; i++) {

            address contractAddress = _contracts[i];
            uint allocated = staker.allocations[contractAddress];
            uint pendingDeallocation = staker.pendingDeallocations[contractAddress];
            uint requestedAmount = _amounts[i];
            uint max = pendingDeallocation > allocated ? 0 : allocated.sub(pendingDeallocation);

            require(max > 0, "Nothing to deallocate on this contract");
            require(requestedAmount <= max, "Cannot deallocate more than allocated");

            // To prevent spam, Small stakes and deallocations are not allowed
            // However, we allow the user to deallocate the entire amount
            if (requestedAmount != max) {
                require(requestedAmount >= MIN_ALLOWED_DEALLOCATION, "Deallocation cannot be less then MIN_ALLOWED_DEALLOCATION");
                require(max.sub(requestedAmount) >= MIN_ALLOCATION, "Final allocation cannot be less then MIN_ALLOCATION");
            }

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
            uint id = ++lastDeallocationId;
            uint next = current.next;

            // point to our new deallocation and insert next item in loop after this one
            current.next = id;
            insertAfter = id;

            deallocations[id] = Deallocation(requestedAmount, deallocateAt, contractAddress, msg.sender, next);
            emit DeallocationRequested(contractAddress, msg.sender, requestedAmount, deallocateAt);

            // increase pending deallocation amount so we keep track of final allocation
            uint newPending = staker.pendingDeallocations[contractAddress].add(requestedAmount);
            staker.pendingDeallocations[contractAddress] = newPending;
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
    ) external onlyInternal whenNotPaused noPendingBurns noPendingDeallocations {

        Contract storage _contract = contracts[contractAddress];
        require(amount <= _contract.staked, 'Burn amount should not exceed total amount staked on contract');

        burns[++lastBurnId] = Burn(amount, now, contractAddress);
        token.burn(amount);
        _contract.burned = _contract.burned.add(amount);

        if (firstBurn == 0) {
            firstBurn = lastBurnId;
        }

        emit Burned(contractAddress, amount);
    }

    function pushReward(address contractAddress, uint amount) external onlyInternal whenNotPaused {

        rewards[++lastRewardId] = Reward(amount, now, contractAddress);
        tokenController.mint(address(this), amount);

        if (firstReward == 0) {
            firstReward = lastRewardId;
        }

        emit Rewarded(contractAddress, amount);
    }

    function processPendingActions() public whenNotPaused {

        while (true) {

            uint firstDeallocationIndex = deallocations[0].next;
            Deallocation storage deallocation = deallocations[firstDeallocationIndex];

            bool canDeallocate = firstDeallocationIndex > 0 && deallocation.deallocateAt <= now;
            bool canBurn = firstBurn != 0;
            bool canReward = firstReward != 0;

            if (!canBurn && !canDeallocate && !canReward) {
                // everything is processed
                break;
            }

            Burn storage burn = burns[firstBurn];
            Reward storage reward = rewards[firstReward];

            if (
                canBurn &&
                (!canDeallocate || burn.burnedAt < deallocation.deallocateAt) &&
                (!canReward || burn.burnedAt < reward.rewardedAt)
            ) {

                // O(n*m)
                if (!_processFirstBurn()) {
                    emit PendingActionsProcessed(false);
                    return;
                }

                continue;
            }

            if (
                canDeallocate &&
                (!canReward || deallocation.deallocateAt < reward.rewardedAt)
            ) {

                // TODO: implement deallocation gas limit check here

                // O(1)
                _processFirstDeallocation();
                continue;
            }

            // O(n)
            if (!_processFirstReward()) {
                emit PendingActionsProcessed(false);
                return;
            }
        }

        // everything is processed!
        emit PendingActionsProcessed(true);
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
                    _contract.burned = _contract.burned.sub(burned);
                    processedToContractIndex = j + 1;
                    return false;
                }
            }

            processedToContractIndex = 0;

            if (i + 1 < stakerCount && gasleft() < BURN_CYCLE_GAS_LIMIT) {
                _contract.staked = _contract.staked.sub(burned);
                _contract.burned = _contract.burned.sub(burned);
                processedToStakerIndex = i + 1;
                return false;
            }
        }

        delete burns[firstBurn];
        ++firstBurn;

        if (firstBurn > lastBurnId) {
            firstBurn = 0;
        }

        processedToStakerIndex = 0;
        _contract.staked = _contract.staked.sub(burned);
        _contract.burned = _contract.burned.sub(burned);

        return true;
    }

    function _processFirstDeallocation() internal {

        uint firstDeallocation = deallocations[0].next;
        Deallocation storage deallocation = deallocations[firstDeallocation];
        Staker storage staker = stakers[deallocation.stakerAddress];

        address contractAddress = deallocation.contractAddress;
        uint allocation = staker.allocations[contractAddress];
        allocation = deallocation.amount >= allocation ? 0 : allocation.sub(deallocation.amount);

        staker.allocations[contractAddress] = allocation;
        staker.pendingDeallocations[contractAddress].sub(deallocation.amount);

        // update pointer to first deallocation
        deallocations[0].next = deallocation.next;
        delete deallocations[firstDeallocation];
    }

    function _processFirstReward() internal returns (bool) {

        Reward storage reward = rewards[firstReward];
        address contractAddress = reward.contractAddress;
        Contract storage _contract = contracts[contractAddress];
        uint stakerCount = _contract.stakers.length;

        // ~27000 gas each cycle
        for (uint i = processedToStakerIndex; i < stakerCount; i++) {

            Staker storage staker = stakers[_contract.stakers[i]];
            uint allocation = staker.allocations[contractAddress];

            // staker's ratio = total staked on contract / staker's stake on contract
            // staker's reward = total reward amount * staker's ratio
            uint rewardedAmount = reward.amount.mul(allocation).div(_contract.staked);
            staker.reward = staker.reward.add(rewardedAmount);

            uint nextIndex = i + 1;

            // cycles left but gas is low
            // recommended REWARD_CYCLE_GAS_LIMIT = 45000
            if (nextIndex < stakerCount && gasleft() < REWARD_CYCLE_GAS_LIMIT) {
                processedToStakerIndex = nextIndex;
                return false;
            }
        }

        delete rewards[firstReward];
        processedToStakerIndex = 0;
        ++firstReward;

        if (firstReward > lastRewardId) {
            firstReward = 0;
        }

        return true;
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

    function initialize() internal {

        if (initialized) {
            return;
        }

        initialized = true;

        tokenController.addToWhitelist(address(this));

        MIN_ALLOCATION = 20 ether;
        MIN_ALLOWED_DEALLOCATION = 20 ether;
        MAX_LEVERAGE = 10;
        DEALLOCATE_LOCK_TIME = 90 days;

        // TODO: To be estimated
        // BURN_CYCLE_GAS_LIMIT = 0;
        // DEALLOCATION_CYCLE_GAS_LIMIT = 0;
        REWARD_CYCLE_GAS_LIMIT = 45000;

        // TODO: implement staking migration here
    }

    function changeDependentContractAddress() public {
        token = NXMToken(master.tokenAddress());
        tokenController = TokenController(master.getLatestAddress("TC"));
        initialize();
    }

    function getTokenAddress() public view returns (address) {
        return address(token);
    }

    function getMasterAddress() public view returns (address) {
        return address(master);
    }
}
