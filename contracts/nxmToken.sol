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

pragma solidity ^0.4.11;
import "./mcr.sol";
import "./nxmTokenData.sol";
import "./nxmToken2.sol";
import "./master.sol";
import "./SafeMaths.sol";
import "./quotationData.sol";
import "./Iupgradable.sol";


contract nxmToken is Iupgradable {
    using SafeMaths for uint;

    address masterAddress;

    master ms;
    quotationData qd;
    mcr m1;
    nxmTokenData td;
    nxmToken2 tc2;

    uint64 private constant DECIMAL1E18 = 1000000000000000000;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);
    event Burn(address indexed _of, bytes16 eventName, uint coverId, uint tokens);

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = master(masterAddress);
        } else {
            ms = master(masterAddress);
            require(ms.isInternal(msg.sender));
            masterAddress = _add;
        }
    }

    modifier onlyInternal {
        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    modifier isMemberAndcheckPauseOrInternal {
        require((ms.isPause() == false && ms.isMember(msg.sender) == true) || ms.isInternal(msg.sender) == true);
        _;
    }

    modifier isMemberAndcheckPause {
        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    function changeDependentContractAddress() public onlyInternal {
        uint currentVersion = ms.currentVersion();
        m1 = mcr(ms.versionContractAddress(currentVersion, "MCR"));
        tc2 = nxmToken2(ms.versionContractAddress(currentVersion, "TOK2"));
        qd = quotationData(ms.versionContractAddress(currentVersion, "QD"));
        td = nxmTokenData(ms.versionContractAddress(currentVersion, "TD"));
    }

    /// @dev Allocates tokens to a Founder Member and stores the details.
    /// Updates the number of tokens that have been allocated already by the creator till date.
    /// @param _to Member address.
    /// @param tokens Number of tokens.
    function allocateFounderTokens(address _to, uint tokens) public onlyOwner {

        if (SafeMaths.add(td.getCurrentFounderTokens(), tokens) <= td.getInitialFounderTokens()) {
            td.changeCurrentFounderTokens(SafeMaths.add(td.currentFounderTokens(), tokens));
            td.addInAllocatedFounderTokens(_to, tokens);
            tc2.rewardToken(_to, SafeMaths.mul(tokens, DECIMAL1E18));
        }
    }

    // Gets the total number of tokens that are in circulation.
    function totalSupply() public constant returns(uint ts) {

        ts = td.getTotalSupply();
    }

    /// @dev Gets symbol of token.
    function symbol() public constant returns(bytes8 _symbol) {

        _symbol = td.symbol();
    }

    /// @dev Gets decimals we are using in project.
    function decimals() public constant returns(uint8 _decimals) {

        _decimals = td.decimals();
    }

    /// @dev Books the user's tokens for maintaining Assessor Velocity
    /// i.e., these tokens cannot be used to cast another vote for a specified period of time.
    /// @param _to Claims assessor address.
    /// @param value number of tokens that will be booked for a period of time. 
    function bookCATokens(address _to, uint value) public onlyInternal {

        td.pushBookedCA(_to, value);

    }

    /// @dev Unlocks the Tokens of a given cover id
    function unlockCN(uint coverid) public onlyInternal {

        address _to = qd.getCoverMemberAddress(coverid);

        //Undeposits all tokens associated with the coverid
        tc2.undepositCN(coverid, 1);
        uint validity;
        uint lockedCN;
        (, validity, lockedCN) = td.getUserCoverLockedCN(_to, coverid);
        uint len = td.getLockedCNLength(_to);
        uint vUpto;
        uint lockedCNIndex;
        for (uint i = 0; i < len; i++) {
            (, vUpto, lockedCNIndex) = td.getUserCoverLockedCN(_to, i);
            if (vUpto == validity && lockedCNIndex == lockedCN) {
                // Updates the validity of lock to now, thereby ending the lock on tokens
                td.updateLockedCN(_to, i, now, lockedCNIndex);
                break;
            }
        }

        td.updateUserCoverLockedCN(_to, coverid, now, lockedCN);
    }

    /// @dev Gets the total number of tokens available for the Claim Assessment.    
    function getAvailableCAToken() public constant returns(uint tokenAvailableCA) {

        tokenAvailableCA = 0;
        uint validUpto;
        uint lockCAamount;
        address _of = msg.sender;
        //Tokens locked for at least a specified minimum lock period can be used for voting
        for (uint i = 0; i < td.getLockCALength(_of); i++) {
            (, validUpto, lockCAamount, ) = td.getLockedCAByindex(_of, i);
            if (SafeMaths.add(now, td.getMinVoteLockPeriod()) < validUpto)
                tokenAvailableCA = SafeMaths.add(tokenAvailableCA, lockCAamount);
        }
        // Booked tokens cannot be used for claims assessment
        uint bookedamt = td.getBookedCA(_of);
        if (tokenAvailableCA > bookedamt)
            tokenAvailableCA = SafeMaths.sub(tokenAvailableCA, bookedamt);
        else
            tokenAvailableCA = 0;
    }

    /// @dev Gets the Token balance (lock + available) of a given address.
    function balanceOf(address _add) public constant returns(uint balance) {

        balance = td.getBalanceOf(_add);
    }

    /// @dev Triggers an event when Tokens are burnt.
    function callBurnEvent(address _add, bytes16 str, uint id, uint value) public onlyInternal {
        Burn(_add, str, id, value);
    }

    /// @dev Triggers an event when Transfer of NXM tokens occur. 
    function callTransferEvent(address _from, address _to, uint value) public onlyInternal {
        Transfer(_from, _to, value);
    }

    /// @dev Transfer Tokens from the sender to the given Receiver's account.
    /// @param _to Receiver's Address.
    /// @param _value Transfer tokens.
    function transfer(address _to, uint256 _value) public isMemberAndcheckPauseOrInternal {

        require(ms.isMember(_to) == true);
        require(_value > 0);
        require(getAvailableTokens(msg.sender) >= _value);

        td.changeBalanceOf(msg.sender, SafeMaths.sub(td.getBalanceOf(msg.sender), _value)); // Subtract from the sender

        td.changeBalanceOf(_to, SafeMaths.add(td.getBalanceOf(_to), _value)); // Add the same to the recipient

        Transfer(msg.sender, _to, _value); // Notify anyone listening that this transfer took place
    }

    /// @dev Allows a given address (Spender) to spend a given amount of the money on behalf of the other user.
    /// @param _spender Spender's address.
    /// @param _value Amount upto which Spender is allowed to transfer.
    function approve(address _spender, uint256 _value) public checkPause returns(bool success) {

        td.setAllowerSpenderAllowance(msg.sender, _spender, _value);
        return true;
    }

    /// @dev Allows a given address (Spender) to spend a given amount of the money on behalf of the other user.
    /// @param _spender Spender's address.
    /// @param _value amount upto which Spender is allowed to transfer.
    /// @param _extraData Extra Data.
    function approveAndCall(address _spender, uint256 _value, bytes _extraData) public checkPause returns(bool success) {

        td.setAllowerSpenderAllowance(msg.sender, _spender, _value);
        Approval(msg.sender, _spender, _value);

        //call the receiveApproval function on the contract you want to be notified. 
        ///This crafts the function signature manually so one doesn't have to include a contract in here just for this.
        //receiveApproval(address _from, uint256 _value, address _tokenContract, bytes _extraData)
        //it is assumed that when does this that the call *should* succeed, 
        //otherwise one would use vanilla approve instead.
        require(_spender.call(bytes4(bytes32(keccak256("receiveApproval(address,uint256,address,bytes)"))), msg.sender, _value, this, _extraData));
        return true;
    }

    /// @dev Transfer the Tokens from a given sender's Address to a given receiver's address. 
    /// If the msg.sender is not allowed to transfer tokens on the behalf of the _from , then transfer will be unsuccessful.
    /// @param _from Sender's address.
    /// @param _to Receiver's address.
    /// @param _value Transfer tokens.
    /// @return success true if transfer is a success, false if transfer is a failure.
    function transferFrom(address _from, address _to, uint256 _value) public isMemberAndcheckPause returns(bool success) {
        // ms=master(masterAddress);
        require(getAvailableTokens(_from) >= _value);
        require(_value <= td.getAllowerSpenderAllowance(_from, msg.sender));
        td.changeBalanceOf(_from, SafeMaths.sub(td.getBalanceOf(_from), _value)); // Subtract from the sender

        td.changeBalanceOf(_to, SafeMaths.add(td.getBalanceOf(_to), _value)); // Add the same to the recipient

        td.setAllowerSpenderAllowance(_from, msg.sender, SafeMaths.sub(td.getAllowerSpenderAllowance(_from, msg.sender), _value));

        Transfer(_from, _to, _value);
        return true;
    }

    /// @dev User can buy the NXMTokens equivalent to the amount paid by the user.
    function buyToken(uint value, address _to) public onlyInternal {

        if (m1.calculateTokenPrice("ETH") > 0) {
            uint256 amount = SafeMaths.div((SafeMaths.mul(value, DECIMAL1E18)), m1.calculateTokenPrice("ETH"));

            // Allocate tokens         
            tc2.rewardToken(_to, amount);
        }
    }

    /// @dev Gets the Token price in a given currency
    /// @param curr Currency name.
    /// @return price Token Price.
    function getTokenPrice(bytes4 curr) public constant returns(uint price) {

        price = m1.calculateTokenPrice(curr);

    }

    /// @dev Burns the NXM Tokens of a given address. Updates the balance of the user and total supply of the tokens. 
    /// @param tokens Number of tokens
    /// @param _of User's address.
    function burnTokenForFunding(uint tokens, address _of, bytes16 str, uint id) public onlyInternal {
        require(td.getBalanceOf(_of) >= tokens);
        td.changeBalanceOf(_of, SafeMaths.sub(td.getBalanceOf(_of), tokens));

        td.changeTotalSupply(SafeMaths.sub(td.getTotalSupply(), tokens));
        Burn(_of, str, id, tokens);
    }

    /// @dev Undeposit, Deposit, Unlock and Push In Locked CN
    /// @param _of address of Member
    /// @param _coverid Cover Id
    /// @param _locktime Pending Time + Cover Period 7*1 days
    function depositLockCNEPOff(address _of, uint _coverid, uint _locktime) public onlyInternal {

        uint timestamp = now + _locktime;

        uint dCNValidUpto;
        uint dCNLastAmount;
        uint len;
        (, len) = td.getUserCoverDepositCNLength(_of, _coverid);
        (, , dCNValidUpto, dCNLastAmount) = td.getUserCoverDepositCNByIndex(_of, _coverid, SafeMaths.sub(len, 1));
        uint dCNAmount;
        (, dCNAmount) = td.getDepositCN(_coverid, _of);

        uint coverValidUntil = qd.getValidityOfCover(_coverid);
        if (coverValidUntil > timestamp) {
            if (dCNValidUpto < timestamp) {
                if (dCNAmount > 0) {
                    tc2.undepositCN(_coverid, 1);
                    tc2.depositCN(_coverid, dCNAmount, timestamp, _of);
                } else
                    tc2.depositCN(_coverid, dCNLastAmount, timestamp, _of);
            }
        } else if (coverValidUntil > now) {
            unlockCN(_coverid);
            if (dCNAmount > 0) {
                td.pushInUserCoverLockedCN(_of, _coverid, timestamp, dCNAmount);
                tc2.depositCN(_coverid, dCNAmount, timestamp, _of);
            } else {
                td.pushInUserCoverLockedCN(_of, _coverid, timestamp, dCNLastAmount);
                tc2.depositCN(_coverid, dCNLastAmount, timestamp, _of);
            }

        } else if (coverValidUntil < now) {
            if (dCNAmount > 0) {
                tc2.undepositCN(_coverid, 1);
                td.pushInUserCoverLockedCN(_of, _coverid, timestamp, dCNAmount);
                tc2.depositCN(_coverid, dCNAmount, timestamp, _of);
            } else {
                td.pushInUserCoverLockedCN(_of, _coverid, timestamp, dCNLastAmount);
                tc2.depositCN(_coverid, dCNLastAmount, timestamp, _of);
            }
        }
    }

    /// @dev The total NXM tokens locked against Smart contract.
    /// @param _scAddress smart contract address.
    /// @return _totalLockedNXM total NXM tokens.
    function getTotalLockedNXMToken(address _scAddress) public constant returns(uint _totalLockedNXM) {
        _totalLockedNXM = 0;

        uint stakeAmt;
        uint dateAdd;
        uint burnedAmt;
        uint nowTime = now;
        uint totalStaker = td.getTotalStakerAgainstScAddress(_scAddress);
        for (uint i = 0; i < totalStaker; i++) {
            uint scAddressIndx;
            (, scAddressIndx) = td.getScAddressIndexByScAddressAndIndex(_scAddress, i);
            (, , , stakeAmt, burnedAmt, dateAdd) = td.getStakeDetails(scAddressIndx);
            uint16 day1 = uint16(SafeMaths.div(SafeMaths.sub(nowTime, dateAdd), 1 days));
            if (stakeAmt > 0 && td.scValidDays() > day1) {
                uint lockedNXM = SafeMaths.div(SafeMaths.mul(SafeMaths.div(SafeMaths.mul(
                    SafeMaths.sub(td.scValidDays(), day1), 100000), td.scValidDays()), stakeAmt), 100000);
                if (lockedNXM > burnedAmt)
                    _totalLockedNXM = SafeMaths.add(_totalLockedNXM, SafeMaths.sub(lockedNXM, burnedAmt));
            }
        }
    }

    /// @dev NXM tokens locked against particular Smart contract at particular index.
    /// @param _scAddress smart contract address.
    /// @param _scAddressIndex index.
    /// @return _stakerLockedNXM locked NXM tokens.
    function getLockedNXMTokenOfStaker(address _scAddress, uint _scAddressIndex) public constant returns(uint _stakerLockedNXM) {
        _stakerLockedNXM = 0;

        address scAddress;
        uint stakeAmt;
        uint dateAdd;
        uint burnedAmt;
        uint nowTime = now;
        (, , scAddress, stakeAmt, burnedAmt, dateAdd) = td.getStakeDetails(_scAddressIndex);
        uint16 day1 = uint16(SafeMaths.div(SafeMaths.sub(nowTime, dateAdd), 1 days));
        if (_scAddress == scAddress && stakeAmt > 0 && td.scValidDays() > day1) {
            uint lockedNXM = SafeMaths.div(SafeMaths.mul(SafeMaths.div(SafeMaths.mul(
                SafeMaths.sub(td.scValidDays(), day1), 100000), td.scValidDays()), stakeAmt), 100000);
            if (lockedNXM > burnedAmt)
                _stakerLockedNXM = SafeMaths.sub(lockedNXM, burnedAmt);
        }
    }

    /// @dev total locked NXM tokens for staker in all the smart contracts.
    /// @param _of staker address.
    /// @return _stakerLockedNXM total locked NXM tokens.
    function getLockedNXMTokenOfStakerByStakerAddress(address _of) public constant returns(uint _stakerLockedNXM) {
        _stakerLockedNXM = 0;

        uint stakeAmt;
        uint dateAdd;
        uint burnedAmt;
        uint nowTime = now;
        uint totalStaker = td.getTotalScAddressesAgainstStaker(_of);
        for (uint i = 0; i < totalStaker; i++) {
            uint stakerIndx;
            (, stakerIndx) = td.getStakerIndexByStakerAddAndIndex(_of, i);
            (, , , stakeAmt, burnedAmt, dateAdd) = td.getStakeDetails(stakerIndx);
            uint16 dayStaked = uint16(SafeMaths.div(SafeMaths.sub(nowTime, dateAdd), 1 days));
            if (stakeAmt > 0 && td.scValidDays() > dayStaked) {
                uint lockedNXM = SafeMaths.div(SafeMaths.mul(SafeMaths.div(SafeMaths.mul(
                    SafeMaths.sub(td.scValidDays(), dayStaked), 100000), td.scValidDays()), stakeAmt), 100000);
                if (lockedNXM > burnedAmt)
                    _stakerLockedNXM = SafeMaths.add(_stakerLockedNXM, SafeMaths.sub(lockedNXM, burnedAmt));
            }
        }
    }

    /// @dev sending commission to staker on purchase of smart contract.
    /// @param _scAddress staker address.
    /// @param _premiumNXM premium of cover in NXM.
    function updateStakerCommissions(address _scAddress, uint _premiumNXM) public onlyInternal {

        uint commissionToBePaid = SafeMaths.div(SafeMaths.mul(_premiumNXM, 20), 100);
        uint stakeLength = td.getTotalStakerAgainstScAddress(_scAddress);
        for (uint i = td.scAddressLastCommIndex(_scAddress); i < stakeLength; i++) {
            if (commissionToBePaid > 0) {
                uint scAddressIndx;
                (, scAddressIndx) = td.getScAddressIndexByScAddressAndIndex(_scAddress, i);
                uint stakeAmt;
                address stakerAdd;
                (, stakerAdd, , stakeAmt, , ) = td.getStakeDetails(scAddressIndx);
                uint totalCommission = SafeMaths.div(SafeMaths.mul(stakeAmt, 50), 100);
                uint commissionPaid;
                (, commissionPaid) = td.getTotalStakeCommission(stakerAdd, _scAddress, scAddressIndx);
                if (totalCommission > commissionPaid) {
                    if (totalCommission >= SafeMaths.add(commissionPaid, commissionToBePaid)) {
                        td.pushStakeCommissions(stakerAdd, _scAddress, scAddressIndx, commissionToBePaid, now);
                        tc2.rewardToken(stakerAdd, commissionToBePaid);
                        if (i > 0)
                            td.setSCAddressLastCommIndex(_scAddress, i);
                        commissionToBePaid = 0;
                        break;
                    } else {
                        td.pushStakeCommissions(stakerAdd, _scAddress, scAddressIndx, SafeMaths.sub(totalCommission, commissionPaid), now);
                        tc2.rewardToken(stakerAdd, SafeMaths.sub(totalCommission, commissionPaid));
                        commissionToBePaid = SafeMaths.sub(commissionToBePaid, SafeMaths.sub(totalCommission, commissionPaid));
                    }
                }
            } else
                break;

        }
        if (commissionToBePaid > 0 && stakeLength > 0)
            td.setSCAddressLastCommIndex(_scAddress, SafeMaths.sub(stakeLength, 1));
    }

    /// @dev Available tokens for use.
    /// @param _add user address.
    /// @return tokens total available tokens.
    function getAvailableTokens(address _add) public constant returns(uint tokens) {
        return SafeMaths.sub(
            SafeMaths.sub(
                SafeMaths.sub(
                    SafeMaths.sub(
                        td.getBalanceOf(_add), 
                        td.getBalanceMVWithAddress(_add)), 
                    td.getBalanceCAWithAddress(_add)), 
                td.getBalanceCN(_add)), 
            getLockedNXMTokenOfStakerByStakerAddress(_add)
            );
    }

    /// @dev Number of days extra lock while voting as CA.
    function getLockCADays() constant returns(uint32) {
        uint32 _days = td.lockCADays();
        return _days;
    }

}

