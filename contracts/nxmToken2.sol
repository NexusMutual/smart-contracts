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
import "./SafeMaths.sol";
import "./memberRoles.sol";
import "./Iupgradable.sol";


contract nxmToken2 is Iupgradable {
    using SafeMaths
    for uint;

    master ms;
    quotationData qd;
    nxmTokenData td;
    mcr m1;
    nxmToken tc1;
    memberRoles mr;

    uint64 private constant DECIMAL1E18 = 1000000000000000000;
    

    address masterAddress;

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

    function changeDependentContractAddress() onlyInternal {
        uint currentVersion = ms.currentVersion();
        m1 = mcr(ms.versionContractAddress(currentVersion, "MCR"));
        tc1 = nxmToken(ms.versionContractAddress(currentVersion, "TOK1"));
        qd = quotationData(ms.versionContractAddress(currentVersion, "QD"));
        td = nxmTokenData(ms.versionContractAddress(currentVersion, "TD"));
    }

    function changeMemberRolesAddress(address memberAddress) onlyInternal
    {
        mr = memberRoles(memberAddress);
    }
    
    /// @dev Locks tokens against a cover.     
    /// @param premiumNxm Premium in NXM of cover.
    /// @param coverPeriod Cover Period of cover.
    /// @param coverId Cover id of a cover.
    /// @param senderAddress Quotation owner's Ethereum address.
    /// @return amount Number of tokens that are locked
    function lockCN(uint premiumNxm, uint16 coverPeriod, uint coverId, address senderAddress) onlyInternal returns(uint amount) {

        uint pastlocked;
        (, pastlocked) = td.getUserCoverLockedCN(senderAddress, coverId);

        require(pastlocked == 0);

        amount = SafeMaths.div(SafeMaths.mul(premiumNxm, 5), 100);
        rewardToken(senderAddress, amount);

        uint ld = SafeMaths.add(SafeMaths.add(now, td.lockTokenTimeAfterCoverExp()), uint(coverPeriod) * 1 days);
        td.pushInUserCoverLockedCN(senderAddress, coverId, ld, amount);

    }

    /// @dev Burns tokens used for fraudulent voting against a claim
    /// @param claimid Claim Id.
    /// @param _value number of tokens to be burned
    /// @param _to User's address.
    function burnCAToken(uint claimid, uint _value, address _to) onlyInternal {

        require(tc1.tokensLocked(_to, "CLA", now) >= _value);
        td.pushInBurnCAToken(_to, claimid, now, _value);
        td.changeLockAmount("CLA", _to, _value, false);
        td.changeBalanceOf(_to, td.getBalanceOf(_to) - _value);
        burnLockedTokenExtended(_to, claimid, _value, "BurnCA");
    }

    /// @dev Allocates tokens against a given address
    /// @param _to User's address.
    /// @param amount Number of tokens rewarded.
    function rewardToken(address _to, uint amount) onlyInternal {

        require(ms.isMember(_to) == true);

        // Change total supply and individual balance of user
        td.changeBalanceOf(_to, SafeMaths.add(td.getBalanceOf(_to), amount)); // mint new tokens
        td.changeTotalSupply(SafeMaths.add(td.getTotalSupply(), amount)); // track the supply
        tc1.callTransferEvent(0, _to, amount);
    }

    /// @dev minting the tokens.
    /// @param amount amount of tokens to be minted.
    function mintClaimRewardToken(uint amount) onlyInternal {

        td.changeBalanceOf(msg.sender, SafeMaths.add(td.getBalanceOf(msg.sender), amount)); // mint new tokens
        td.changeTotalSupply(SafeMaths.add(td.getTotalSupply(), amount)); // track the supply
        tc1.callTransferEvent(0, msg.sender, amount);
    }

    /// @dev Reduce validity period of a given number of tokens, locked for Claim Assessment
    /// @param _to  User's address.
    /// @param _time Time for which tokens will be reduced.
    /// @param _noOfTokens Number of tokens that will get reduced. Should be less than or equal to the number of tokens of selected bond.
    // function reduceCAWithAddress(address _to, uint _time, uint _noOfTokens) onlyInternal {

    //     uint lockedCATokenLength = td.getLockedCALength(_to);
    //     uint vUpto;
    //     uint amount;
    //     uint claimId;
    //     uint validityExpire = td.getLastExpiredLockCA(_to);
    //     bool validityExpiredCheck = false;
    //     uint yetToReduce = _noOfTokens;
    //     for (uint i = validityExpire; i < lockedCATokenLength; i++) {
    //         (, vUpto, amount, claimId) = td.getLockedCAByindex(_to, i);
    //         if (vUpto > now && validityExpiredCheck == false) {
    //             validityExpire = i;
    //             validityExpiredCheck = true;
    //         }
    //         if (amount > 0) {

    //             uint newTime = now;
    //             if (vUpto > SafeMaths.add(now, _time))
    //                 newTime = SafeMaths.sub(vUpto, _time);
    //             if (yetToReduce > amount) {
    //                 yetToReduce = SafeMaths.sub(yetToReduce, amount);
    //                 td.lockCA(_to, newTime, amount, claimId);
    //                 td.changeLockedCAByIndex(_to, i, 0);
    //             } else {
    //                 td.lockCA(_to, newTime, yetToReduce, claimId);
    //                 td.changeLockedCAByIndex(_to, i, SafeMaths.sub(amount, yetToReduce));
    //                 yetToReduce = 0;
    //                 break;
    //             }

    //         }
    //     }
    //     td.setLastExpiredLockCA(_to, validityExpire);
    // }

    /// @dev Extends validity period of a given number of tokens, locked for Claim Assessment
    /// @param _to  User's address.
    /// @param _timestamp Timestamp for which tokens will be extended.
    /// @param _noOfTokens Number of tokens that will get extended. Should be less than or equal to the number of tokens of selected bond. 
    // function extendCAWithAddress(address _to, uint _timestamp, uint _noOfTokens, uint claimId) onlyInternal {

    //     require(td.getBalanceCAWithAddress(_to) >= _noOfTokens);
    //     uint yetToExtend = _noOfTokens;
    //     uint len = td.getLockedCALength(_to);
    //     uint vUpto;
    //     uint amount;
    //     for (uint i = 0; i < len; i++) {
    //         (, vUpto, amount, ) = td.getLockedCAByindex(_to, i);
    //         if (amount > 0 && vUpto > now) {
    //             if (yetToExtend > amount) {
    //                 yetToExtend = SafeMaths.sub(yetToExtend, amount);
    //                 td.lockCA(_to, SafeMaths.add(vUpto, _timestamp), amount, claimId);
    //                 td.changeLockedCAByIndex(_to, i, 0);
    //             } else {
    //                 td.lockCA(_to, SafeMaths.add(vUpto, _timestamp), yetToExtend, claimId);
    //                 td.changeLockedCAByIndex(_to, i, SafeMaths.sub(amount, yetToExtend));
    //                 yetToExtend = 0;
    //                 break;
    //             }
    //         }
    //     }
    // }

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
        burnLockedTokenExtended(_to, coverid, depositedTokens, "Burn");
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

    /// @dev Extends validity period of a given number of tokens locked for claims assessment.
    /// @param index  index of exisiting bond.
    /// @param _days number of days for which tokens will be extended.
    /// @param noOfTokens Number of tokens that will get extended. Should be less than or equal to the no.of tokens of selected bond.
    // function extendCA(uint index, uint _days, uint noOfTokens) isMemberAndcheckPause {

    //     uint vUpto;
    //     uint amount;
    //     uint claimId;
    //     (, vUpto, amount, claimId) = td.getLockedCAByindex(msg.sender, index);
    //     require(vUpto >= now && amount >= noOfTokens);
    //     td.changeLockedCAByIndex(msg.sender, index, SafeMaths.sub(amount, noOfTokens));
    //     td.lockCA(msg.sender, (SafeMaths.add(vUpto, SafeMaths.mul(_days, 1 days))), noOfTokens, claimId);

    // }

    /// @dev Unlocks tokens deposited against a cover.Changes the validity timestamp of deposit tokens.
    /// @dev In order to submit a claim,20% tokens are deposited by the owner. In case a claim is escalated, another 20% tokens are deposited.
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

    /// @dev Locks a given number of tokens for Claim Assessment.
    /// @param _value number of tokens lock.
    /// @param _days Validity(in days) of tokens.
    // function lockCA(uint _value, uint _days, uint claimId) isMemberAndcheckPause {

    //     require(tc1.getAvailableTokens(msg.sender) >= _value); // Check if the sender has enough
    //     require(_value > 0);
    //     td.lockCA(msg.sender, SafeMaths.add(now, SafeMaths.mul(_days, 1 days)), _value, claimId);
    // }

    /// @dev Locks a given number of tokens for Member vote.
    /// @param _add address  of member
    /// @param _value number of tokens lock.
    /// @param _days Validity(in days) of tokens.
    // function lockMV(address _add, uint _value, uint _days) onlyInternal {

    //     require(tc1.getAvailableTokens(_add) >= _value); // Check if the sender has enough
    //     require(_value > 0);
    //     td.lockMV(_add, SafeMaths.add(now, SafeMaths.mul(_days, 1 days)), _value);
    // }

    /// @dev Burns tokens locked against a Smart Contract Cover, called when a claim submitted against this cover is accepted.
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
                uint stakerLockedNXM = tc1.getLockedNXMTokenOfStaker(_scAddress, scAddressIndex);
                if (stakerLockedNXM > 0) {
                    if (stakerLockedNXM >= burnNXMAmount) {
                        td.addBurnedAmount(scAddressIndex, burnNXMAmount);
                        burnLockedTokenExtended(_of, coverid, burnNXMAmount, "Burn");
                        if (i > 0)
                            td.setSCAddressLastBurnIndex(_scAddress, i);
                        burnNXMAmount = 0;
                        break;
                    } else {
                        td.addBurnedAmount(scAddressIndex, stakerLockedNXM);
                        burnLockedTokenExtended(_of, coverid, stakerLockedNXM, "Burn");
                        burnNXMAmount = SafeMaths.sub(burnNXMAmount, stakerLockedNXM);
                    }
                }
            } else
                break;
        }
        if (burnNXMAmount > 0 && totalStaker > 0)
            td.setSCAddressLastBurnIndex(_scAddress, SafeMaths.sub(totalStaker, 1));
    }

    /// @dev Staking on contract.
    /// @param _scAddress smart contract address.
    /// @param _amount amount of NXM.
    function addStake(address _scAddress, uint _amount) isMemberAndcheckPause {
        require(tc1.balanceOf(msg.sender) >= _amount); // Check if the sender has enough
        td.addStake(msg.sender, _scAddress, _amount);
    }

    /// @dev paying the joining fee.
    function payJoiningFee() payable checkPause {

        require(msg.value == td.joiningFee());
        address _add = td.walletAddress();
        require(_add != 0x0000);
        bool succ = _add.send(msg.value);
        if (succ == true)
            mr.updateMemberRole(msg.sender, 3, 1);
    }

    /// @dev Burns tokens.
    function burnLockedTokenExtended(address _of, uint _coverid, uint _burnNXMAmount, bytes16 str) internal {

        tc1.burnTokenForFunding(_burnNXMAmount, _of, str, _coverid);
        tc1.callTransferEvent(_of, 0, _burnNXMAmount); // notify of the event

    }

}