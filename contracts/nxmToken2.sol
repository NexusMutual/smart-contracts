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

import "./nxmTokenData.sol";
import "./quotationData.sol";
import "./mcr.sol";
import "./nxmToken.sol";
import "./master.sol";
import "./Iupgradable.sol";
import "./claimsReward.sol";
import "./imports/govblocks-protocol/Governed.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract MemberRoles {
    
    function updateMemberRole(address _memberAddress, uint32 _roleId, bool _typeOf, uint _validity) public;

    function changeCanAddMember(uint32 _roleId, address _newCanAddMember) public;

    function checkRoleIdByAddress(address _memberAddress, uint32 _roleId) public view returns(bool);
    
    function setValidityOfMember(address _memberAddress, uint32 _roleId, uint _validity) public;
}


contract nxmToken2 is Iupgradable, Governed {
    using SafeMaths
    for uint;

    master ms;
    quotationData qd;
    nxmTokenData td;
    mcr m1;
    nxmToken tc1;
    MemberRoles mr;
    claimsReward cr;

    uint64 private constant DECIMAL1E18 = 1000000000000000000;
    address masterAddress;

    modifier onlyInternal {
        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    modifier isMemberAndcheckPause {
        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }
    
    modifier onlyOwner {

        require(ms.isOwner(msg.sender) == true);
        _;
    }

    modifier canWithdraw { 
        
        require(getLockedNXMTokenOfStakerByStakerAddress(msg.sender) == 0); // No pending stake.
        require(totalBalanceCNOfUser(msg.sender) == 0);   // No active covers.
        require(td.tokensLocked(msg.sender, "CLA", now) == 0); // No locked tokens for CA.
        require(!mr.checkRoleIdByAddress(msg.sender, 4)); // No locked tokens for Member/Governance voting
        require(cr.getAllPendingRewardOfUser(msg.sender) == 0); // No pending reward to be claimed(claim assesment).
        _;
        
    }
    
    function nxmToken2 () {
        
    }
    
    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = master(masterAddress);
        } else {
            ms = master(masterAddress);
            require(ms.isInternal(msg.sender) == true);
            masterAddress = _add;
          
        }

    }

    function changeDependentContractAddress() onlyInternal {
        uint currentVersion = ms.currentVersion();
        m1 = mcr(ms.versionContractAddress(currentVersion, "MCR"));
        tc1 = nxmToken(ms.versionContractAddress(currentVersion, "TOK1"));
        qd = quotationData(ms.versionContractAddress(currentVersion, "QD"));
        td = nxmTokenData(ms.versionContractAddress(currentVersion, "TD"));
        cr = claimsReward(ms.versionContractAddress(currentVersion, "CR"));
    }

    function changeMemberRolesAddress(address memberAddress) onlyInternal {
        mr = MemberRoles(memberAddress);
    }

    /// @dev Gets the Token price in a given currency
    /// @param curr Currency name.
    /// @return price Token Price.
    function getTokenPrice(bytes4 curr) public constant returns(uint price) {
        price = m1.calculateTokenPrice(curr);
    }

    /// @dev Books the user's tokens for maintaining Assessor Velocity
    /// i.e., these tokens cannot be used to cast another vote for a specified period of time.
    /// @param _to Claims assessor address.
    /// @param value number of tokens that will be booked for a period of time. 
    function bookCATokens(address _to, uint value) public onlyInternal {
        td.pushBookedCA(_to, value);
    }

    /// @dev Locks tokens against a cover.     
    /// @param premiumNxm Premium in NXM of cover.
    /// @param coverPeriod Cover Period of cover.
    /// @param coverId Cover id of a cover.
    /// @param senderAddress Quotation owner's Ethereum address.
    /// @return amount Number of tokens that are locked
    function lockCN(
        uint premiumNxm,
        uint16 coverPeriod,
        uint coverId,
        address senderAddress
    )
        onlyInternal
        returns (uint amount)
    {
        uint pastlocked;
        (, pastlocked) = td.getUserCoverLockedCN(senderAddress, coverId);
        require(pastlocked == 0);
        amount = SafeMaths.div(SafeMaths.mul(premiumNxm, 5), 100);
        rewardToken(senderAddress, amount);
        uint ld = SafeMaths.add(SafeMaths.add(now, td.lockTokenTimeAfterCoverExp()), uint(coverPeriod) * 1 days);
        td.pushInUserCoverLockedCN(senderAddress, coverId, ld, amount);
    }

    /// @dev Unlocks tokens locked against a given cover id
    function unlockCN(uint coverid) public onlyInternal {

        address _to = qd.getCoverMemberAddress(coverid);

        //Undeposits all tokens associated with the coverid
        undepositCN(coverid, 1);
        uint validity;
        uint lockedCN;
        (, validity, lockedCN) = td.getUserCoverLockedCN(_to, coverid);
        uint len = td.getLockedCNLength(_to);
        uint vUpto;
        uint lockedCNIndex;
        for (uint i = 0; i < len; i++) {

            (, vUpto, lockedCNIndex) = td.getUserCoverLockedCN(_to, qd.getAllCoversOfUser(_to)[i]);
            if (vUpto == validity && lockedCNIndex == lockedCN) {
                // Updates the validity of lock to now, thereby ending the lock on tokens
                td.updateLockedCN(_to, i, now, lockedCNIndex);
                break;
            }
        }

        td.updateUserCoverLockedCN(_to, coverid, now, lockedCN);
    }

    /// @dev Allocates tokens against a given address or reward contract  
    /// @param _to User's address.
    /// @param amount Number of tokens rewarded.
    function rewardToken(address _to, uint amount) onlyInternal {
        require(ms.isMember(_to) || _to == address(ms.versionContractAddress(ms.currentVersion(), "CR")));
        td.increaseTotalSupply(amount); // increase total supply
        td.increaseBalanceOf(_to, amount); // increase balance of reward contract
        tc1.callTransferEvent(0, _to, amount);
    }

    /// @dev Burns tokens used for fraudulent voting against a claim
    /// @param claimid Claim Id.
    /// @param _value number of tokens to be burned
    /// @param _to User's address.
    function burnCAToken(uint claimid, uint _value, address _to) onlyAuthorizedToGovern {
        require(tc1.tokensLocked(_to, "CLA", now) >= _value);
        td.pushInBurnCAToken(_to, claimid, now, _value);
        td.changeLockAmount("CLA", _to, _value, false);
        tc1.burnToken(_to, "BurnCA", claimid, _value);
    }

    /// @dev Burns tokens deposited against a cover, called when a claim submitted against this cover is denied.
    /// @param coverid Cover Id.
    function burnCNToken(uint coverid) onlyInternal {
        address _to = qd.getCoverMemberAddress(coverid);
        uint depositedTokens;
        (, depositedTokens) = td.getDepositCN(coverid, _to);
        require(depositedTokens > 0);
        //Undeposit all tokens locked against the cover
        undepositCN(coverid, 1);
        uint validity;
        uint lockedTokens;
        (, validity, lockedTokens) = td.getUserCoverLockedCN(_to, coverid);
        uint len = td.getLockedCNLength(_to);
        uint vUpto;
        uint amount;
        for (uint i = 0; i < len; i++) {
            (, vUpto, amount) = td.getLockedCNByindex(_to, i);
            if (vUpto == validity && amount == lockedTokens) {
                td.updateLockedCN(_to, i, vUpto, SafeMaths.sub(amount, depositedTokens));
                break;
            }
        }
        td.updateUserCoverLockedCN(_to, coverid, validity, SafeMaths.sub(lockedTokens, depositedTokens));
        tc1.burnToken(_to, "Burn CN", coverid, depositedTokens);
    }

    /// @dev Deposits locked tokens against a given cover id, called whenever a claim is submitted against a coverid
    /// @param coverid Cover Id.
    /// @param _value number of tokens to deposit.
    /// @param _days Validity of tokens.
    /// @param _to User's address.
    function depositCN(uint coverid, uint _value, uint _days, address _to) onlyInternal {

        uint amount;
        uint depositCN;
        (, amount) = td.getUserCoverLockedCN(_to, coverid);
        (, depositCN) = td.getDepositCN(coverid, msg.sender);
        require(SafeMaths.sub(amount, depositCN) >= _value); // Check if the sender has enough tokens to deposit
        require(_value > 0);
        td.pushInUserCoverDepositCN(_to, coverid, _days, _value);
    }

    /// @dev Unlocks tokens deposited against a cover.
    /// @dev In order to submit a claim,20% tokens are deposited by the owner.
    /// @param coverid Cover Id.
    /// @param allDeposit 0 in case we want only 1 undeposit against a cover,1 in order to undeposit all deposits against a cover
    function undepositCN(uint coverid, uint8 allDeposit) onlyInternal {
        address _to = qd.getCoverMemberAddress(coverid);
        uint tokensDeposited;
        (, tokensDeposited) = td.getDepositCN(coverid, _to);
        require(tokensDeposited >= 0); // Check if the cover has tokens
        uint len;
        (, len) = td.getUserCoverDepositCNLength(_to, coverid);
        uint vUpto;
        uint amount;
        for (uint i = 0; i < len; i++) {
            (, , vUpto, amount) = td.getUserCoverDepositCNByIndex(_to, coverid, i);
            if (vUpto >= now) {
                td.updateUserCoverDepositCNByIndex(_to, coverid, i, now, amount);
                if (allDeposit == 0)
                    break;
            }
        }
    }

    /// @dev Burns tokens staked against a Smart Contract Cover.
    ///      Called when a claim submitted against this cover is accepted.
    /// @param coverid Cover Id.
    function burnStakerLockedToken(uint coverid, bytes4 curr, uint sa) onlyInternal {
        address _scAddress;
        (, _scAddress) = qd.getscAddressOfCover(coverid);
        uint tokenPrice = m1.calculateTokenPrice(curr);
        sa = SafeMaths.mul(sa, DECIMAL1E18);
        uint burnNXMAmount = SafeMaths.div(SafeMaths.mul(sa, DECIMAL1E18), tokenPrice);
        uint totalStaker = td.getTotalStakerAgainstScAddress(_scAddress);
        for (uint i = td.scAddressLastBurnIndex(_scAddress); i < totalStaker; i++) {
            if (burnNXMAmount > 0) {
                uint scAddressIndex;
                (, scAddressIndex) = td.getScAddressIndexByScAddressAndIndex(_scAddress, i);
                address _of;
                uint dateAdd;
                (, _of, , , , dateAdd) = td.getStakeDetails(scAddressIndex);
                uint stakerLockedNXM = getLockedNXMTokenOfStaker(_scAddress, scAddressIndex);
                if (stakerLockedNXM > 0) {
                    if (stakerLockedNXM >= burnNXMAmount) {
                        td.addBurnedAmount(scAddressIndex, burnNXMAmount);
                        tc1.burnToken(_of, "BurnSLT", coverid, burnNXMAmount);
                        if (i > 0)
                            td.setSCAddressLastBurnIndex(_scAddress, i);
                        burnNXMAmount = 0;
                        break;
                    } else {
                        td.addBurnedAmount(scAddressIndex, stakerLockedNXM);
                        tc1.burnToken(_of, "BurnSLT", coverid, burnNXMAmount);
                        burnNXMAmount = SafeMaths.sub(burnNXMAmount, stakerLockedNXM);
                    }
                }
            } else
                break;
        }
        if (burnNXMAmount > 0 && totalStaker > 0)
            td.setSCAddressLastBurnIndex(_scAddress, SafeMaths.sub(totalStaker, 1));
    }

    /// @dev Gets total locked NXM tokens for staker in all the smart contracts.
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
    
    /// @dev NXM tokens locked against particular smart contract at particular index.
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
   
    /// @dev Called by user to pay joining membership fee
    function payJoiningFee() public payable checkPause {
        require(msg.value == td.joiningFee());
        address _add = td.walletAddress();
        require(_add != 0x0000);
        bool succ = _add.send(msg.value);
        if (succ == true)
            mr.updateMemberRole(msg.sender, 3, true, 0);
    }

    /// @dev Adding to Member Role called Voter while Member voting.
    function lockForMemberVote(address voter, uint time) onlyInternal {
        if (!mr.checkRoleIdByAddress(voter, 4))
            mr.updateMemberRole(voter, 4, true, time);
        else
            mr.setValidityOfMember(voter, 4, time);
    }

    /// @dev Change the address who can update GovBlocks member role.
    ///      Called when updating to a new version. 
    ///      Need to remove onlyOwner to onlyInternal and update automatically at version change
    function changeCanAddMemberAddress(address _newAdd) onlyOwner {
        mr.changeCanAddMember(3, _newAdd);
        mr.changeCanAddMember(4, _newAdd);
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
                    undepositCN(_coverid, 1);
                    depositCN(_coverid, dCNAmount, timestamp, _of);
                } else
                    depositCN(_coverid, dCNLastAmount, timestamp, _of);
            }
        } else if (coverValidUntil > now) {
            unlockCN(_coverid);
            if (dCNAmount > 0) {
                td.pushInUserCoverLockedCN(_of, _coverid, timestamp, dCNAmount);
                depositCN(_coverid, dCNAmount, timestamp, _of);
            } else {
                td.pushInUserCoverLockedCN(_of, _coverid, timestamp, dCNLastAmount);
                depositCN(_coverid, dCNLastAmount, timestamp, _of);
            }

        } else if (coverValidUntil < now) {
            if (dCNAmount > 0) {
                undepositCN(_coverid, 1);
                td.pushInUserCoverLockedCN(_of, _coverid, timestamp, dCNAmount);
                depositCN(_coverid, dCNAmount, timestamp, _of);
            } else {
                td.pushInUserCoverLockedCN(_of, _coverid, timestamp, dCNLastAmount);
                depositCN(_coverid, dCNLastAmount, timestamp, _of);
            }
        }
    }

    /// @dev Staking on contract.
    /// @param _scAddress smart contract address.
    /// @param _amount amount of NXM.
    function addStake(address _scAddress, uint _amount) isMemberAndcheckPause {
        require(tc1.balanceOf(msg.sender) >= _amount); // Check if the sender has enough
        td.addStake(msg.sender, _scAddress, _amount);
    }

    /// @dev Sends commission to underwriter on purchase of staked smart contract.
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
                        rewardToken(address(ms.versionContractAddress(ms.currentVersion(), "CR")), commissionToBePaid);
                        if (i > 0)
                            td.setSCAddressLastCommIndex(_scAddress, i);
                        commissionToBePaid = 0;
                        break;
                    } else {
                        td.pushStakeCommissions(stakerAdd, _scAddress, scAddressIndx, SafeMaths.sub(totalCommission, commissionPaid), now);
                        rewardToken(address(ms.versionContractAddress(ms.currentVersion(), "CR")), SafeMaths.sub(totalCommission, commissionPaid));
                        commissionToBePaid = SafeMaths.sub(commissionToBePaid, SafeMaths.sub(totalCommission, commissionPaid));
                    }
                }
            } else
                break;

        }
        if (commissionToBePaid > 0 && stakeLength > 0)
            td.setSCAddressLastCommIndex(_scAddress, SafeMaths.sub(stakeLength, 1));
    }

    /// @dev Called by existed member if if wish to Withdraw membership.
    function withdrawMembership() canWithdraw isMemberAndcheckPause {

        tc1.burnToken(msg.sender, "Withdraw", 0, td.getBalanceOf(msg.sender));
        mr.updateMemberRole(msg.sender, 3, false, 0);
    }

    /// @dev It will tell if user has locked tokens in member vote or not.
    /// @param _add addressof user.
    function voted(address _add) constant returns(bool) {
        return mr.checkRoleIdByAddress(_add, 4);
    }
  
    function totalBalanceCNOfUser(address _add) constant returns(uint total) {
        uint len = qd.getUserCoverLength(_add);
        total = 0;
        for (uint i = 0; i < len; i++) {
            uint vUpto;
            uint tokens;
            (vUpto, tokens) = td.userCoverLockedCN(_add, qd.getAllCoversOfUser(_add)[i]);
            if (vUpto > now)
                total = SafeMaths.add(total, tokens);
        }
    }
     
}
