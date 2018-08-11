/* Copyright (C) 2017 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.4.24;

import "./NXMaster.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract NXMTokenData is Iupgradable {

    NXMaster ms;

    address masterAddress;
    string public version = "NXM 0.1";
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    uint initialTokens;
    uint public currentFounderTokens;
    uint64 bookTime;
    uint64 minVoteLockPeriod;
    uint16 public scValidDays;
    uint32 public lockMVDays;
    uint32 public lockCADays;
    uint public joiningFee;
    address public walletAddress;
    mapping(address => bytes32[]) public lockReason;

    struct stakeCommission {
        uint commissionAmt;
        uint commissionDate;
        bool claimed;
    }

    struct stake {
        address stakerAdd;
        address scAddress;
        uint amount;
        uint dateAdd;
    }

    struct lockToken {
        uint validUpto;
        uint amount;
    }

    struct lockTokenCA {
        lockToken tokenLock;
        uint claimId;
    }

    struct allocatedTokens {
        address memberAdd;
        uint tokens;
        uint dateAdd;
        uint blockNumber;
    }

    mapping(address => uint[]) scAddressStake;
    stake[] stakeDetails;
    mapping(uint => uint) stakerBurnedAmount;
    mapping(address => uint[]) stakerIndex;
    mapping(address => uint) public scAddressLastCommIndex;
    mapping(address => uint) public scAddressLastBurnIndex;
    mapping(address => mapping(address => mapping(uint => stakeCommission[]))) stakerSCIndexCommission;
    mapping(address => mapping (address => mapping(uint => uint))) lastClaimedCommission;
    allocatedTokens[] allocatedFounderTokens;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(uint => lockToken[])) public userCoverDepositCN;
    mapping(address => mapping(bytes32 => lockToken)) public locked;
    mapping(address => lockToken[]) lockedCN;
    mapping(address => lockToken[]) bookedCA;
    mapping(address => mapping(uint => lockToken)) public userCoverLockedCN;
    mapping(address => mapping(address => uint256)) public allowerSpenderAllowance;
    mapping(address => mapping(uint => lockToken[])) public burnCAToken;
    uint public lockTokenTimeAfterCoverExp;

    function NXMTokenData(
        uint256 initialSupply,
        string tokenName,
        uint8 decimalUnits,
        string tokenSymbol
    ) {

        initialTokens = 1500000;
        balanceOf[msg.sender] = initialSupply; // Give the creator all initial tokens
        totalSupply = initialSupply; // Update total supply
        name = tokenName; // Set the name for display purposes
        symbol = tokenSymbol; // Set the symbol for display purposes
        decimals = decimalUnits;
        bookTime = SafeMaths.mul64(SafeMaths.mul64(12, 60), 60);
        minVoteLockPeriod = SafeMaths.mul64(7, 1 days);
        lockTokenTimeAfterCoverExp = SafeMaths.mul(35, 1 days);
        scValidDays = 200;
        joiningFee = 2000000000000000; //gwei - 0.002*(10**18)
        lockCADays = SafeMaths.mul32(7, 1 days);
        lockMVDays = SafeMaths.mul32(2, 1 days);
    }

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = NXMaster(masterAddress);
        } else {
            ms = NXMaster(masterAddress);
            require(ms.isInternal(msg.sender) == true);
            masterAddress = _add;

        }
    }

    function changeDependentContractAddress() onlyInternal {

    }

    modifier onlyInternal {

        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier onlyOwner {

        require(ms.isOwner(msg.sender) == true);
        _;
    }

    /// @dev Gets the number of NXM Tokens that are alloted by the creator to be distributed among founders.
    function getCurrentFounderTokens() constant returns(uint tokens) {
        tokens = currentFounderTokens;
    }

    /// @dev Gets the minimum time(in seconds) for which CA tokens should be locked, in order to participate in Claims assessment.
    function getMinVoteLockPeriod() constant returns(uint64 period) {
        period = minVoteLockPeriod;
    }

    /// @dev Sets the minimum time(in seconds) for which CA tokens should be locked, in order to be used in Claims assessment.
    function changeMinVoteLockPeriod(uint64 period) onlyOwner {
        minVoteLockPeriod = period;
    }

    /// @dev Sets the current number of NXM Tokens, allocated to founders.
    function changeCurrentFounderTokens(uint tokens) onlyInternal {
        currentFounderTokens = tokens;
    }

    /// @dev Sets the maximum number of tokens that can be allocated as founder tokens.
    /// @param initTokens number of tokens.
    function changeIntialTokens(uint initTokens) onlyOwner {
        if (initTokens > currentFounderTokens)
            initialTokens = initTokens;

    }

    /// @dev Adds the number of tokens received by an address as founder tokens.
    /// @param _to Address of founder member.
    /// @param tokens Number of tokens allocated.
    function addInAllocatedFounderTokens(address _to, uint tokens) onlyInternal {
        allocatedFounderTokens.push(allocatedTokens(_to, tokens, now, block.number));
    }

    /// @dev Gets the total number of tokens (Locked + Unlocked) of a User.
    /// @param _add Address.
    /// @return bal Number of tokens.
    function getBalanceOf(address _add) constant returns(uint bal) {
        bal = balanceOf[_add];
    }

    /// @dev increase the balance
    /// @param _of address
    /// @param by amount of tokens
    function increaseBalanceOf(address _of, uint by) onlyInternal {
        balanceOf[_of] = SafeMaths.add(balanceOf[_of], by);
    }

    /// @dev decrease the balance
    /// @param _of address
    /// @param by amount of tokens
    function decreaseBalanceOf(address _of, uint by) onlyInternal {
        balanceOf[_of] = SafeMaths.sub(balanceOf[_of], by);
    }

    /// @dev Gets total number of NXM tokens that are in circulation.
    function getTotalSupply() constant returns(uint ts) {
        ts = totalSupply;
    }

    /// @dev increase totalSupply
    /// @param by amount of tokens
    function increaseTotalSupply(uint by) onlyInternal {
        totalSupply = SafeMaths.add(totalSupply, by);
    }

    /// @dev decrease totalSupply
    /// @param by amount of tokens
    function decreaseTotalSupply(uint by) onlyInternal {
        totalSupply = SafeMaths.sub(totalSupply, by);
    }

    /// @dev Allows a given address (Spender) to spend a given amount of the money on behalf of the other user.
    /// @param a1 Allower's address.
    /// @param a2 Spender's address who will be allowed to spend a given no.of tokens on behalf of the owner.
    /// @param value tokens upto which Spender is allowed to transfer.
    function setAllowerSpenderAllowance(address a1, address a2, uint value) onlyInternal {
        allowerSpenderAllowance[a1][a2] = value;
    }

    /// @dev Gets the no. of tokens a user is allowed to spend on behalf of the other user.
    /// @param a1 Allower's address who has given the allowance to spend.
    /// @param a2 Spender's address.
    /// @return value tokens upto which Spender is allowed to transfer.
    function getAllowerSpenderAllowance(address a1, address a2) constant returns(uint value) {
        value = allowerSpenderAllowance[a1][a2];
    }

    /// @dev books the user's tokens for maintaining Assessor Velocity, i.e.
    ///                 once a token is used to cast a vote as a Claims assessor,
    ///                 the same token cannot be used to cast another vote before a fixed period of time(in milliseconds)
    /// @param _of user's address.
    /// @param value number of tokens that will be locked for a period of time.
    function pushBookedCA(address _of, uint value) onlyInternal {

        bookedCA[_of].push(lockToken(SafeMaths.add(now, bookTime), value));
    }

    /// @dev Gets number of times a user's tokens have been booked for participation in Claims assessment.
    /// @param _of User's address.
    /// @return len number to times
    function getBookedCALength(address _of) constant returns(uint timesBooked) {
        timesBooked = bookedCA[_of].length;
    }

    /// @dev Changes the time period up to which tokens will be locked.
    ///               Used to generate the validity period of tokens booked by a user for participating in claim's assessment/claim's voting.
    function changeBookTime(uint64 _time) onlyOwner {
        bookTime = _time;
    }

    /// @dev Gets the time period(in seconds) for which a Claims assessor's tokens are booked, i.e., cannot be used to caste another vote.
    function getBookTime() constant returns(uint64 _time) {
        _time = bookTime;
    }

    /// @dev Gets the validity date and number of tokens booked for participation in Claims assessment, at a given mapping index.
    function getBookedCAByindex(address _of, uint _index) constant returns(uint index, uint valid, uint val) {
        index = _index;
        valid = bookedCA[_of][_index].validUpto;
        val = bookedCA[_of][_index].amount;
    }

    /// @dev Calculates the sum of tokens booked by a user for Claims Assessment.
    function getBookedCA(address _to) constant returns(uint tokensBookedCA) {
        tokensBookedCA = 0;
        for (uint i = 0; i < bookedCA[_to].length; i++) {
            if (now < bookedCA[_to][i].validUpto)
                tokensBookedCA = SafeMaths.add(tokensBookedCA, bookedCA[_to][i].amount);
        }
    }

    /// @dev Adds details of tokens that are Booked for Claim Assessment by a user.
    /// @param _of User's address.
    /// @param _timestamp Validity of tokens.
    /// @param value number of tokens booked.
    function pushInBookedCA(address _of, uint _timestamp, uint value) onlyInternal {
        bookedCA[_of].push(lockToken(_timestamp, value));
    }

    /// @dev Gets the maximum number of tokens that can be allocated as Founder Tokens
    function getInitialFounderTokens() constant returns(uint tokens) {
        tokens = initialTokens;
    }

    /// @dev Updates the number of tokens locked for Claims assessment.
    /// @param _reason Purpose for locking
    /// @param _of User's address.
    /// @param _amount number of tokens.
    /// @param _time validity.
    function lockTokens(bytes32 _reason, address _of, uint256 _amount, uint256 _time) onlyInternal {
        locked[_of][_reason] = lockToken(_time, _amount);
        // emit Lock(_of, _reason, _amount, validUntil);
    }

    /// @dev Extends the validity period of tokens locked under Claims assessment.
    /// @param _of User's address.
    /// @param _time New validity date(timestamp).
    function changeLockValidity(bytes32 _reason, address _of, uint256 _time, bool _extend) onlyInternal {
        if (_extend)
            locked[_of][_reason].validUpto = SafeMaths.add(_time, locked[_of][_reason].validUpto);
        else
            locked[_of][_reason].validUpto = SafeMaths.sub(locked[_of][_reason].validUpto, _time);
        // emit Lock( _of, _reason, locked[_of][_reason].amount, locked[_of][_reason].validity);

    }

    /**
     * @dev Increase number of tokens locked for a specified purpose
     * @param _reason The purpose to lock tokens
     * @param _amount Number of tokens to be increased
     */
    function increaseLockAmount(bytes32 _reason, address _of, uint256 _amount) public onlyInternal

    {
        locked[_of][_reason].amount = SafeMaths.add(locked[_of][_reason].amount, _amount);
        // emit Lock(_of, _reason, locked[_of][_reason].amount, locked[_of][_reason].validity);
    }

    /**
     * @dev Reduce number of tokens locked for a specified purpose
     * @param _reason The purpose to lock tokens
     * @param _amount Number of tokens to be increased
     */
    function reduceLockAmount(bytes32 _reason, address _of, uint256 _amount) public onlyInternal

    {
        locked[_of][_reason].amount = SafeMaths.sub(locked[_of][_reason].amount, _amount);
        // emit Lock(_of, _reason, locked[_of][_reason].amount, locked[_of][_reason].validity);
    }

    /// @dev Gets number of times a user has locked tokens for covers.
    /// @param _of User's address.
    /// @return len number of times tokens has been locked for covers.
    function getLockedCNLength(address _of) constant returns(uint len) {
        len = lockedCN[_of].length;
    }

    /// @dev Gets the validity date and number of lock tokens against cover notes of a user at a given index.
    function getLockedCNByindex(address _of, uint _index) constant returns(uint index, uint valid, uint val) {
        index = _index;
        valid = lockedCN[_of][_index].validUpto;
        val = lockedCN[_of][_index].amount;
    }

    /// @dev Updates the number and validity of tokens locked for cover notes by a user using the mapping index.
    /// @param _of User's address.
    /// @param index index position.
    /// @param timestamp New validity date(timestamp).
    /// @param amount1 New number of tokens.
    function updateLockedCN(address _of, uint index, uint timestamp, uint amount1) onlyInternal {
        lockedCN[_of][index].validUpto = timestamp;
        lockedCN[_of][index].amount = amount1;
    }

    /// @dev Sets lock CA days - number of days for which tokens are locked while submitting a vote.
    function setlockCADays(uint32 _val) onlyInternal {
        lockCADays = _val;

    }

    /// @dev Gets the number of times a user has deposit tokens to submit claim of a cover.
    /// @param _of User's address.
    /// @param _coverid Cover Id against which tokens are deposit.
    /// @return coverId ID of cover.
    /// @return timesDeposit number of times deposit.
    function getUserCoverDepositCNLength(address _of, uint _coverid) constant returns(uint coverId, uint timesDeposit) {
        coverId = _coverid;
        timesDeposit = userCoverDepositCN[_of][_coverid].length;
    }

    /// @dev Gets the validity and number of tokens deposited by the owner of a cover for Claim Submission.
    /// @param _of user's address.
    /// @param coverid Cover Id.
    /// @param index Index value of mapping.
    /// @return valid Validity Timestamp.
    /// @return val number of tokens to be deposited.
    function getUserCoverDepositCNByIndex(address _of, uint _coverid, uint _index)
    constant
    returns(
        uint coverid,
        uint index,
        uint valid,
        uint val
        ) {
        coverid = _coverid;
        index = _index;
        valid = userCoverDepositCN[_of][_coverid][_index].validUpto;
        val = userCoverDepositCN[_of][_coverid][_index].amount;
    }

    /// @dev Updates the validity and number of tokens deposited by the owner of a cover for Claim Submission.
    /// @param _of user's address
    /// @param coverid Cover Id.
    /// @param index Index value of mapping.
    /// @param _timestamp New Validity Timestamp of tokens.
    /// @param amount1 New number of tokens to deposit.
    function updateUserCoverDepositCNByIndex(address _of, uint coverid, uint index, uint _timestamp, uint amount1) onlyInternal {
        userCoverDepositCN[_of][coverid][index].validUpto = _timestamp;
        userCoverDepositCN[_of][coverid][index].amount = amount1;
    }

    /// @dev Gets validity and number of tokens locked against a given cover.
    /// @param _of User's address.
    /// @param _coverid Cover id.
    /// @return valid Validity timestamp of locked tokens.
    /// @return val number of locked tokens.
    function getUserCoverLockedCN(address _of, uint _coverid) constant returns(uint coverid, uint valid, uint val) {
        coverid = _coverid;
        valid = userCoverLockedCN[_of][_coverid].validUpto;
        val = userCoverLockedCN[_of][_coverid].amount;
    }

    /// @dev Updates the validity and number of tokens locked against a cover of a user.
    function updateUserCoverLockedCN(address _of, uint coverid, uint timestamp, uint amount1) onlyInternal {
        userCoverLockedCN[_of][coverid].validUpto = timestamp;
        userCoverLockedCN[_of][coverid].amount = amount1;
    }

    /**
     * @dev Returns tokens locked for a specified address for a
     *      specified purpose at a specified time
     *
     * @param _of The address whose tokens are locked
     * @param _reason The purpose to query the lock tokens for
     * @param _time The timestamp to query the lock tokens for
     */
    function tokensLocked(address _of, bytes32 _reason, uint256 _time)
        public
        view
        returns (uint256 amount)
    {
        if (locked[_of][_reason].validUpto > _time)
            amount = locked[_of][_reason].amount;
    }

    function changeLockAmount(bytes32 _reason, address _add, uint _value, bool increase) onlyInternal {
        if (increase)
            increaseLockAmount(_reason, _add, _value);
        else
            reduceLockAmount(_reason, _add, _value);

    }

    /// @dev Calculates the Sum of tokens locked for Cover Note of a user.(available + unavailable)
    function getBalanceCN(address _to) constant returns(uint tokensLockedCN) {
        tokensLockedCN = 0;
        for (uint i = 0; i < lockedCN[_to].length; i++) {
            if (now < lockedCN[_to][i].validUpto)
                tokensLockedCN = SafeMaths.add(tokensLockedCN, lockedCN[_to][i].amount);
        }

    }

    /// @dev Calculates the total number of tokens deposited against a cover by a user.
    /// @param _coverId cover id.
    /// @param _of user's address.
    /// @return tokensDeposited total number of tokens deposited in a cover by a user.
    function getDepositCN(uint _coverId, address _of) constant returns(uint coverid, uint tokensDeposited) {
        coverid = _coverId;
        tokensDeposited = 0;
        for (uint i = 0; i < userCoverDepositCN[_of][_coverId].length; i++) {
            if (now < userCoverDepositCN[_of][_coverId][i].validUpto)
                tokensDeposited = SafeMaths.add(tokensDeposited, userCoverDepositCN[_of][_coverId][i].amount);
        }
    }

    /// @dev Calculates the remaining number of locked tokens that are not deposit for claim submission
    ///                    (can be used in deposit) by a user of a cover.
    function getBalanceLockedTokens(uint _coverId, address _of) constant returns(uint coverid, uint amt) {
        coverid = _coverId;
        uint lockedTokens = 0;
        if (userCoverLockedCN[_of][_coverId].validUpto > uint64(now))
            lockedTokens = userCoverLockedCN[_of][_coverId].amount;
        uint tokensDeposited;
        (, tokensDeposited) = getDepositCN(_coverId, _of);
        amt = SafeMaths.sub(lockedTokens, tokensDeposited);
    }

    /// @dev Adds details of tokens that are locked against a given cover by a user.
    /// @param _of User's address.
    /// @param coverid Cover Id.
    /// @param _timestamp Validity of tokens.
    /// @param amount number of tokens lock.
    function pushInUserCoverLockedCN(address _of, uint coverid, uint _timestamp, uint amount) onlyInternal {
        lockedCN[_of].push(lockToken(_timestamp, amount));
        userCoverLockedCN[_of][coverid] = lockToken(_timestamp, amount);
    }

    /// @dev Adds details of tokens that are burned against a given claim of a user.
    /// @param _of User's address.
    /// @param claimid Claim Id.
    /// @param timestamp Validity of tokens.
    /// @param amount number of tokens burnt.
    function pushInBurnCAToken(address _of, uint claimid, uint timestamp, uint amount) onlyInternal {
        burnCAToken[_of][claimid].push(lockToken(timestamp, amount));
    }

    /// @dev Adds details of tokens that are deposited against a given cover by a user for submission of claim.
    /// @param _of User's address.
    /// @param coverid Cover Id.
    /// @param timestamp Validity of tokens.
    /// @param amount1 number of tokens deposited.
    function pushInUserCoverDepositCN(address _of, uint coverid, uint timestamp, uint amount1) onlyInternal {
        userCoverDepositCN[_of][coverid].push(lockToken(timestamp, amount1));
    }

    /// @dev Sets extra lock period for a cover, post its expiry.
    function setLockTokenTimeAfterCoverExp(uint time) onlyInternal {
        lockTokenTimeAfterCoverExp = time;
    }

    /// @dev Adds a new stake record.
    /// @param _of staker address.
    /// @param _scAddress smart contract address.
    /// @param _amount amountof NXM to be staked.
    function addStake(address _of, address _scAddress, uint _amount) onlyInternal {
        stakeDetails.push(stake(_of, _scAddress, _amount, now));
        scAddressStake[_scAddress].push(stakeDetails.length - 1);
        stakerIndex[_of].push(stakeDetails.length - 1);
    }

    /// @dev Adds a new token lock reason against an address.
    function setLockReason(address _add, bytes32 _reason) onlyInternal {
        lockReason[_add].push(_reason);
    }

    /// @dev Gets the number of reasons aginst which a users token is locked
    function getLockReasonLength(address _add) constant returns(uint) {
        return lockReason[_add].length;
    }

    /// @dev Checks if tokens have been locked before by an address for the same reason.
    function hasBeenLockedBefore(address _add, bytes32 _reason) constant returns(bool locked) {
        locked = false;
        for (uint i=0; i < lockReason[_add].length; i++) {
            if (lockReason[_add][i] == _reason) {
                locked = true;
                break;
            }
        }
    }

    /// @dev changes the amount of underwritten stake at a particular index.
    /// @param _index index at which amount is to be changed.
    /// @param _amount amount of NXM.
    function updateStake(uint _index, uint _amount) onlyInternal {
        stakeDetails[_index].amount = _amount;
    }

    /// @dev changes the date of staking at particular index.
    /// @param _index index at which date is to be changed.
    /// @param _dateAdd new date.
    function updateStakedDate(uint _index, uint _dateAdd) onlyInternal {
        stakeDetails[_index].dateAdd = _dateAdd;
    }

    /// @dev changes the burned amount of staking at particular index.
    /// @param _index index at which burned amount is to be changed.
    /// @param _burnedAmount new amount.
    function updateBurnedAmount(uint _index, uint _burnedAmount) onlyInternal {
        stakerBurnedAmount[_index] = _burnedAmount;
    }

    /// @dev Adds the burned amount in existed burned amount of staking at particular index.
    /// @param _index index at which burned amount is to be added.
    /// @param _burnedAmount amount to be added.
    function addBurnedAmount(uint _index, uint _burnedAmount) onlyInternal {
        stakerBurnedAmount[_index] = SafeMaths.add(stakerBurnedAmount[_index], _burnedAmount);
    }

    /// @dev Gets the details of stake by index.
    /// @param _index index of stake.
    /// @return _indx index of stake.
    /// @return _stakerAdd address of staker.
    /// @return _scAddress smart contract address
    /// @return _amount NXM token Staked.
    /// @return _burnedAmount amount of NXM burned.
    /// @return _dateAdd date of staking.
    function getStakeDetails(uint _index)
    constant
    returns(
        uint _indx,
        address _stakerAdd,
        address _scAddress,
        uint _amount,
        uint _burnedAmount,
        uint _dateAdd
        ) {
        _indx = _index;
        _stakerAdd = stakeDetails[_index].stakerAdd;
        _scAddress = stakeDetails[_index].scAddress;
        _amount = stakeDetails[_index].amount;
        _burnedAmount = stakerBurnedAmount[_index];
        _dateAdd = stakeDetails[_index].dateAdd;
    }

    /// @dev pushes the commission earned by a staker.
    /// @param _of address of staker.
    /// @param _scAddress address of smart contract.
    /// @param _stakerIndx index of the staker to distribute commission.
    /// @param _commissionAmt amount to be given as commission.
    /// @param _commissionDate date when commission is given.
    function pushStakeCommissions(address _of, address _scAddress, uint _stakerIndx, uint _commissionAmt, uint _commissionDate) onlyInternal {
        stakerSCIndexCommission[_of][_scAddress][_stakerIndx].push(stakeCommission(_commissionAmt, _commissionDate, false));
    }

    /// @dev Gets commission details.
    /// @param _of address of staker.
    /// @param _scAddress smart contract address.
    /// @param _stakerIndx index of the staker to distribute commission.
    /// @param _index index of commission.
    /// @return indx index of commission.
    /// @return stakerIndex index of the staker to distribute commission.
    /// @return commissionAmt amount of commission.
    /// @return commissionDate date when commission was given.
    function getStakeCommission(address _of, address _scAddress, uint _stakerIndx, uint _index)
    constant
    returns(
        uint indx,
        uint stakerIndex,
        uint commissionAmt,
        uint commissionDate,
        bool claimed
        ) {
        indx = _index;
        stakerIndex = _stakerIndx;
        commissionAmt = stakerSCIndexCommission[_of][_scAddress][_stakerIndx][_index].commissionAmt;
        commissionDate = stakerSCIndexCommission[_of][_scAddress][_stakerIndx][_index].commissionDate;
        claimed = stakerSCIndexCommission[_of][_scAddress][_stakerIndx][_index].claimed;
    }

    /// @dev Gets length of stake commission.
    /// @param _of address of staker.
    /// @param _scAddress smart contract address.
    /// @param _stakerIndx index of the staker commission.
    /// @return _length length.
    function getStakeCommissionLength(address _of, address _scAddress, uint _stakerIndx) constant returns(uint _length) {
        _length = stakerSCIndexCommission[_of][_scAddress][_stakerIndx].length;
    }

    /// @dev Gets total stake commission given to an underwriter.
    /// @param _of address of staker.
    /// @param _scAddress smart contract address.
    /// @param _stakerIndx index of the staker commission.
    /// @return stakerIndex index of the staker commission.
    /// @return commissionAmt total amount given to staker.
    function getTotalStakeCommission(address _of, address _scAddress, uint _stakerIndx) constant returns(uint stakerIndex, uint commissionAmt) {
        commissionAmt = 0;
        stakerIndex = _stakerIndx;
        for (uint i = 0; i < stakerSCIndexCommission[_of][_scAddress][_stakerIndx].length; i++) {
            commissionAmt = SafeMaths.add(commissionAmt, stakerSCIndexCommission[_of][_scAddress][_stakerIndx][i].commissionAmt);
        }
    }

    /// @dev Gets total number of underwriters against a given smart contract.
    function getTotalStakerAgainstScAddress(address _scAddress) constant returns(uint) {
        return scAddressStake[_scAddress].length;
    }

    /// @dev Gets Smart contract address index from array at particular index.
    function getScAddressIndexByScAddressAndIndex(address _scAddress, uint _index) constant returns(uint _indx, uint _scAddressIndx) {
        _indx = _index;
        _scAddressIndx = scAddressStake[_scAddress][_index];
    }

    /// @dev Gets total number of smart contract address on which underwriter had staked.
    function getTotalScAddressesAgainstStaker(address _of) constant returns(uint) {
        return stakerIndex[_of].length;
    }

    /// @dev Gets underwriter index from array of smart contracts on which underwriter staked.
    function getStakerIndexByStakerAddAndIndex(address _of, uint _index) constant returns(uint _indx, uint _stakerIndx) {
        _indx = _index;
        _stakerIndx = stakerIndex[_of][_index];
    }

    /// @dev Gets total amount staked on a given smart contract by underwriters.
    function getTotalStakedAmtByStakerAgainstScAddress(address _of, address _scAddress) constant returns(uint _totalStakedAmt) {
        _totalStakedAmt = 0;
        for (uint i = 0; i < stakerIndex[_of].length; i++) {
            if (stakeDetails[stakerIndex[_of][i]].scAddress == _scAddress)
                _totalStakedAmt = SafeMaths.add(_totalStakedAmt, stakeDetails[stakerIndex[_of][i]].amount);
        }
    }

    /// @dev Sets number of days for which NXM needs to staked in case of underwriting
    function changeSCValidDays(uint16 _days) onlyOwner {
        scValidDays = _days;
    }

    /// @dev sets joining fee.
    function setJoiningfee(uint val) onlyOwner {
        joiningFee = val;
    }

    /// @dev Sets multi sig wallet address where membership fee shall be transferred.
    function setWalletAddress(address _add) onlyOwner {
        walletAddress = _add;
    }

    /// @dev Sets the index till which commission is distrubuted.
    /// @param _scAddress smart contract address.
    /// @param _index last index.
    function setSCAddressLastCommIndex(address _scAddress, uint _index) onlyInternal {
        scAddressLastCommIndex[_scAddress] = _index;
    }

    /// @dev Sets the index till which all Locked tokens for staking are burned.
    /// @param _scAddress smart contract address.
    /// @param _index last index.
    function setSCAddressLastBurnIndex(address _scAddress, uint _index) onlyInternal {
        scAddressLastBurnIndex[_scAddress] = _index;
    }

    function getLastClaimedCommission(address _of, address _sc, uint _index) constant returns(uint) {

        return lastClaimedCommission[_of][_sc][_index];
    }

    function setLastClaimedCommission(address _of, address _sc, uint _index, uint lastClaimed) onlyInternal {

        lastClaimedCommission[_of][_sc][_index] = lastClaimed;
    }

    function setClaimedCommision(address _of, address _scAddress, uint _stakerIndx, uint _index) onlyInternal {

        stakerSCIndexCommission[_of][_scAddress][_stakerIndx][_index].claimed = true;
    }

}
