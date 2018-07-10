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
                uint stakerLockedNXM = getLockedNXMTokenOfStaker(_scAddress, scAddressIndex);
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
   
    /// @dev paying the joining fee.
    function payJoiningFee() payable checkPause {

        require(msg.value == td.joiningFee());
        address _add = td.walletAddress();
        require(_add != 0x0000);
        bool succ = _add.send(msg.value);
        if (succ == true)
            mr.updateMemberRole(msg.sender, 3, true, 0);
    }

    /// @dev Burns tokens.
    function burnLockedTokenExtended(address _of, uint _coverid, uint _burnNXMAmount, bytes16 str) internal {

        tc1.burnTokenForFunding(_burnNXMAmount, _of, str, _coverid);
        tc1.callTransferEvent(_of, 0, _burnNXMAmount); // notify of the event

    }

}