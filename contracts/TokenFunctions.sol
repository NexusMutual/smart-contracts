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

pragma solidity 0.4.24;

import "./NXMaster.sol";
import "./NXMToken.sol";
import "./MCR.sol";
import "./TokenController.sol";
import "./ClaimsReward.sol";
import "./TokenData.sol";
import "./QuotationData.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/govblocks-protocol/Governed.sol";
import "./imports/govblocks-protocol/MemberRoles.sol";
import "./Iupgradable.sol";


contract TokenFunctions is Iupgradable, Governed {
    using SafeMaths for uint;

    NXMaster public ms;
    MCR public m1;
    MemberRoles public mr;
    NXMToken public tk;
    TokenController public tc;
    TokenData public td;
    QuotationData public qd;
    ClaimsReward public cr;

    uint private constant DECIMAL1E18 = uint(10) ** 18;

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

    modifier isMemberAndcheckPause {
        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    constructor () public {
        dappName = "NEXUS-MUTUAL";
    }
     
    /**
    * @dev Gets current number of NXM Tokens of founders.
    */ 
    function getCurrentFounderTokens() external view returns(uint tokens) {
        tokens = tk.balanceOf(tk.founderAddress());
    }
 
    /**
    * @dev Used to set and update master address
    * @param _add address of master contract
    */
    function changeMasterAddress(address _add) public {
        if (address(ms) != address(0)) {
            require(ms.isInternal(msg.sender) == true);
        }
        ms = NXMaster(_add);
    }

    function changeMemberRolesAddress(address memberAddress) public onlyInternal {
        mr = MemberRoles(memberAddress);
    }

    /**
    * @dev Just for interface
    */
    function changeDependentContractAddress() public {
        uint currentVersion = ms.currentVersion();
        tk = NXMToken(ms.versionContractAddress(currentVersion, "TK"));
        td = TokenData(ms.versionContractAddress(currentVersion, "TD"));
        tc = TokenController(ms.versionContractAddress(currentVersion, "TC"));
        cr = ClaimsReward(ms.versionContractAddress(currentVersion, "CR"));
        qd = QuotationData(ms.versionContractAddress(currentVersion, "QD"));
        m1 = MCR(ms.versionContractAddress(currentVersion, "MCR"));
    }

    /**
    * @dev Gets the Token price in a given currency
    * @param curr Currency name.
    * @return price Token Price.
    */
    function getTokenPrice(bytes4 curr) public view returns(uint price) {
        price = m1.calculateTokenPrice(curr);
    }

    /**
    * @dev It will tell if user has locked tokens in member vote or not.
    * @param _add addressof user.
    */ 
    function voted(address _add) public view returns(bool) {
        return mr.checkRoleIdByAddress(_add, 4);
    }
    
    /**
    * @dev Adding to Member Role called Voter while Member voting.
    */ 
    function lockForMemberVote(address voter, uint time) public onlyInternal {
        if (!mr.checkRoleIdByAddress(voter, 4))
            mr.updateMemberRole(voter, 4, true, time);
        else {
            if (mr.getValidity(voter, 4) < time)
                mr.setValidityOfMember(voter, 4, time);
        }
    }

    /**
    * @dev Set the flag to check if cover note is deposited against the cover id
    * @param coverId Cover Id.
    */ 
    function depositCN(uint coverId) public onlyInternal returns (bool success) {
        uint toBurn;
        (, toBurn) = td.getDepositCNDetails(coverId);
        uint availableCNToken = _getLockedCNAgainstCover(coverId).sub(toBurn);
        require(availableCNToken > 0);
        td.setDepositCN(coverId, true, toBurn);
        success = true;    
    }

    /**
    * @dev Unlocks tokens deposited against a cover.
    * @param coverId Cover Id.
    * @param burn if set true, 50 % amount of locked cover note to burn. 
    */
    function undepositCN(uint coverId, bool burn) public onlyInternal returns (bool success) {
        uint toBurn;
        (, toBurn) = td.getDepositCNDetails(coverId);
        if (burn == true) {
            td.setDepositCN(coverId, true, toBurn.add(_getDepositCNAmount(coverId)));
        } else {
            td.setDepositCN(coverId, true, toBurn);
        }
        success = true;  
    }

    /**
    * @dev Unlocks covernote locked against a given cover 
    * @param coverId id of cover
    */ 
    function unlockCN(uint coverId) public onlyInternal {
        address _of = qd.getCoverMemberAddress(coverId);
        uint lockedCN = _getLockedCNAgainstCover(coverId);
        require(lockedCN > 0);
        require(undepositCN(coverId, false));
        uint burnAmount;
        (, burnAmount) = td.getDepositCNDetails(coverId);
        uint availableCNToken = lockedCN.sub(burnAmount);
        bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
        if (burnAmount == 0) {
            tc.releaseLockedTokens(_of, reason, availableCNToken);
        } else if (availableCNToken == 0) {
            tc.burnLockedTokens(_of, reason, burnAmount);
        } else {
            tc.releaseLockedTokens(_of, reason, availableCNToken);
            tc.burnLockedTokens(_of, reason, burnAmount);
        }
    }

    /**
    * @dev Change the address who can update GovBlocks member role.
    *      Called when updating to a new version.
    *      Need to remove onlyOwner to onlyInternal and update automatically at version change
    */
    function changeCanAddMemberAddress(address _newAdd) public onlyOwner {
        mr.changeCanAddMember(3, _newAdd);
        mr.changeCanAddMember(4, _newAdd);
    }

    /** 
    * @dev Called by user to pay joining membership fee
    */ 
    function payJoiningFee(address _userAddress) public payable checkPause {
        uint currentVersion = ms.currentVersion();
        if (msg.sender == address(ms.versionContractAddress(currentVersion, "Q2"))) {
            require(td.walletAddress() != address(0));
            require(td.walletAddress().send(msg.value)); //solhint-disable-line
            tc.addToWhitelist(_userAddress);
            mr.updateMemberRole(_userAddress, 3, true, 0);
        } else {
            require(!qd.refundEligible(_userAddress));
            require(!ms.isMember(_userAddress));
            require(msg.value == td.joiningFee());
            qd.setRefundEligible(_userAddress, true);
        }
    }

    function kycVerdict(address _userAddress, bool verdict) public checkPause onlyInternal {
        require(!ms.isMember(_userAddress));
        require(qd.refundEligible(_userAddress));
        require(td.walletAddress() != address(0));
        if (verdict) {
            qd.setRefundEligible(_userAddress, false);
            require(td.walletAddress().send(td.joiningFee())); //solhint-disable-line
            tc.addToWhitelist(_userAddress);
            mr.updateMemberRole(_userAddress, 3, true, 0);
        } else {
            qd.setRefundEligible(_userAddress, false);
            require(_userAddress.send(td.joiningFee())); //solhint-disable-line
        }
    }

    /**
    * @dev Called by existed member if if wish to Withdraw membership.
    */
    function withdrawMembership() public isMemberAndcheckPause {
        require(tc.totalLockedBalance(msg.sender, now) == 0); //solhint-disable-line
        require(!mr.checkRoleIdByAddress(msg.sender, 4)); // No locked tokens for Member/Governance voting
        require(cr.getAllPendingRewardOfUser(msg.sender) == 0); // No pending reward to be claimed(claim assesment).
        tk.burnFrom(msg.sender, tk.balanceOf(msg.sender));
        mr.updateMemberRole(msg.sender, 3, false, 0);
        tc.removeFromWhitelist(msg.sender); // need clarification on whitelist
    }

    function lockCN(
        uint premiumNxm,
        uint coverPeriod,
        uint coverId,
        address _of
    )
        public
        onlyInternal
        returns (uint amount)
    {
        amount = (premiumNxm.mul(5)).div(100);
        uint validity = now.add(td.lockTokenTimeAfterCoverExp()).add(coverPeriod);
        bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
        tc.lock(_of, reason, amount, validity);
    }

    /**
    * @param _of address of Member
    * @param _coverId Cover Id
    * @param _lockTime Pending Time + Cover Period 7*1 days
    */ 
    function depositCNEPOff(address _of, uint _coverId, uint _lockTime) public onlyInternal {
        uint timeStamp = now.add(_lockTime);
        uint coverValidUntil = qd.getValidityOfCover(_coverId);
        if (timeStamp >= coverValidUntil) {
            bytes32 reason = keccak256(abi.encodePacked("CN", _of, _coverId));
            tc.extendLock(_of, reason, timeStamp);
        } 
        depositCN(_coverId);
    }

    /**
    * @dev Staking on contract.
    * @param _scAddress smart contract address.
    * @param _amount amount of NXM.
    */ 
    function addStake(address _scAddress, uint _amount) public isMemberAndcheckPause {
        require(tk.balanceOf(msg.sender) >= _amount);
        uint index = td.addStake(msg.sender, _scAddress, _amount);
        bytes32 reason = keccak256(abi.encodePacked("UW", msg.sender, _scAddress, index));
        uint validity = (td.scValidDays()).mul(1 days);
        tc.lock(msg.sender, reason, _amount, validity);
    }

    /**
    * @dev Sends commission to underwriter on purchase of staked smart contract.
    * @param _scAddress staker address.
    * @param _premiumNXM premium of cover in NXM.
    */
    function updateStakerCommissions(address _scAddress, uint _premiumNXM) public onlyInternal {
        uint commissionToBePaid = (_premiumNXM.mul(20)).div(100);
        uint stakeLength = td.getStakerStakedContractLength(_scAddress);
        address claimsRewardAddress = address(ms.versionContractAddress(ms.currentVersion(), "CR"));
        for (uint i = td.scAddressCurrentCommissionIndex(_scAddress); i < stakeLength; i++) {
            if (commissionToBePaid > 0) {
                address stakerAddress;
                uint stakeAmt;
                stakerAddress = td.smartContractStakers(_scAddress, i);
                stakeAmt = td.getStakerInitialStakedAmountOnContract(stakerAddress, i);
                uint totalCommission = (stakeAmt.mul(50)).div(100);
                uint commissionPaid;
                (, commissionPaid) = td.getTotalStakeCommission(stakerAddress, _scAddress, i);
                if (totalCommission > commissionPaid) {
                    if (totalCommission >= commissionPaid.add(commissionToBePaid)) {
                        td.pushStakeCommissions(stakerAddress, _scAddress, i, commissionToBePaid, now);
                        tc.mint(claimsRewardAddress, commissionToBePaid);
                        if (i > 0)
                            td.setscAddressCurrentCommissionIndex(_scAddress, i);
                        commissionToBePaid = 0;
                        break;
                    } else {
                        td.pushStakeCommissions(stakerAddress, _scAddress, i,
                            totalCommission.sub(commissionPaid), now);
                        tc.mint(claimsRewardAddress, totalCommission.sub(commissionPaid));
                        commissionToBePaid = commissionToBePaid.sub(totalCommission.sub(commissionPaid));
                    }
                }
            } else
                break;
        }
        if (commissionToBePaid > 0 && stakeLength > 0)
            td.setscAddressCurrentCommissionIndex(_scAddress, stakeLength.sub(1));
    }

    /**
    * @dev Burns tokens staked against a Smart Contract Cover.
    *      Called when a claim submitted against this cover is accepted.
    * @param coverid Cover Id.
    */
    function burnStakerLockedToken(uint coverid, bytes4 curr, uint sa) public onlyInternal {
        address scAddress;
        bytes32 reason;
        uint tokenPrice = m1.calculateTokenPrice(curr);
        uint totalStaker = td.getStakerStakedContractLength(scAddress);
        uint scIndex;
        sa = sa.mul(DECIMAL1E18);
        uint burnNXMAmount = sa.mul(DECIMAL1E18).div(tokenPrice);
        address stakerAddress;
        (, scAddress) = qd.getscAddressOfCover(coverid);
        for (uint i = td.scAddressCurrentBurnIndex(scAddress); i < totalStaker; i++) {
            if (burnNXMAmount > 0) {
                stakerAddress = td.getStakerStakedContractByIndex(scAddress, i);
                scIndex = td.getStakerStakedContractIndexByIndex(scAddress, i);
                uint stakerStakedNXM = _getStakerStakedTokensOnSmartContract(stakerAddress, scAddress, scIndex);
                if (stakerStakedNXM > 0) {
                    if (stakerStakedNXM >= burnNXMAmount) {
                        reason = keccak256(abi.encodePacked("UW", stakerAddress, scAddress, scIndex));
                        tc.burnLockedTokens(stakerAddress, reason, burnNXMAmount);
                        if (i > 0)
                            _burnStakerTokenLockedAgainstSmartContract(stakerAddress,
                                scAddress, scIndex, burnNXMAmount);
                        burnNXMAmount = 0;
                        break;
                    } else {
                        _burnStakerTokenLockedAgainstSmartContract(stakerAddress, scAddress, scIndex, stakerStakedNXM);
                        burnNXMAmount = burnNXMAmount.sub(stakerStakedNXM);
                    }
                }
            } else
                break;
        }
        if (burnNXMAmount > 0 && totalStaker > 0)
            td.setscAddressCurrentBurnIndex(scAddress, SafeMaths.sub(totalStaker, 1));
    }

    /**
    * @dev Gets the total staked NXM tokens against Smart contract 
    *       by all stakers
    * @param _scAddress smart contract address.
    * @return amount total staked NXM tokens.
    */
    function getTotalStakedTokensOnSmartContract(address _scAddress) public view returns(uint amount) {
        uint stakedAmount = 0;
        for (uint i = 0; i < td.getStakerStakedContractLength(_scAddress); i++) {
            stakedAmount = stakedAmount.add(_getStakerStakedTokensOnSmartContract(
                td.getSmartContractStakerByIndex(_scAddress, i), _scAddress, i));
        }
    }

    /**
    * @dev Returns amount of NXM Tokens locked as Cover Note for given coverId.
    * @param _of address of the coverHolder.
    * @param _coverId coverId of the cover.
     */
    function getUserLockedCNTokens(address _of, uint _coverId) public returns(uint) {
        _getUserLockedCNTokens(_of, _coverId);
    } 

    function getUserAllLockedCNTokens(address _of) public returns(uint) {
        uint amount = 0;
        for (uint i = 0; i < qd.getUserCoverLength(_of); i++) {
            amount = amount.add(_getUserLockedCNTokens(_of, qd.getAllCoversOfUser(_of)[i]));
        }
        return amount;
    }

    /**
    * @dev Returns amount of NXM Tokens locked as Cover Note against given coverId.
    * @param _coverId coverId of the cover.
    */
    function getLockedCNAgainstCover(uint _coverId) public returns(uint) {
        return _getLockedCNAgainstCover(_coverId);
    }

    /**
    * @dev Returns total amount of staked NXM Tokens on all smart contract .
    * @param _of address of the Staker.
    */ 
    function getStakerAllLockedTokens (address _of) public returns (uint amount) {
        uint stakedAmount = 0;
        address scAddress;
        for (uint i = 0; i < td.getStakerStakedContractLength(_of); i++) {
            scAddress = td.getSmartContractStakerByIndex(_of, i);
            stakedAmount = stakedAmount.add(_getStakerLockedTokensOnSmartContract(_of, scAddress, i));
        }
        amount = stakedAmount;
    }

    /**
    * @dev Returns total unlockable amount of staked NXM Tokens on all smart contract .
    * @param _of address of the Staker.
    */ 
    function getStakerAllUnlockableStakedTokens (address _of) public view returns (uint amount) {
        uint unlockableAmount = 0;
        address scAddress;
        for (uint i = 0; i < td.getStakerStakedContractLength(_of); i++) {
            scAddress = td.getSmartContractStakerByIndex(_of, i);
            unlockableAmount = unlockableAmount.add(_getStakerUnlockableTokensOnSmartContract(_of, scAddress, i));
        }
        amount = unlockableAmount;
    }

    /**
    * @dev releases unlockable staked tokens to staker 
    */
    function unlockStakerUnlockableTokens(address _of) public {
        uint unlockableAmount;
        address scAddress;
        bytes32 reason;
        uint scIndex;
        for (uint i = 0; i < td.getStakerStakedContractLength(_of); i++) {
            scAddress = td.getSmartContractStakerByIndex(_of, i);
            scIndex = td.getStakerStakedContractIndexByIndex(scAddress, i);
            unlockableAmount = _getStakerUnlockableTokensOnSmartContract(_of, scAddress, scIndex);
            reason = keccak256(abi.encodePacked("UW", _of, scAddress, scIndex));
            tc.releaseLockedTokens(_of, reason, unlockableAmount);
        }
    }
    
    /**
    * @dev Books the user's tokens for maintaining Assessor Velocity
    *      i.e., these tokens cannot be used to cast another vote for a specified period of time.
    * @param _to Claims assessor address.
    * @param value number of tokens that will be booked for a period of time.
    */
    function bookCATokens(address _to, uint value) public onlyInternal {
        td.pushBookedCA(_to, value);
    }
    
    /**
    * @dev Internal function to gets unlockable amount of locked NXM tokens,
    *      staked against smartcontract by index
    * @param _of address of user
    * @param _scAddress staked contract address
    * @param _index index of staking
    */
    function _getStakerUnlockableTokensOnSmartContract (
        address _of,
        address _scAddress,
        uint _index
    ) 
        internal
        view
        returns
        (uint amount)
    {   
        uint currentStakedTokens = _getStakerStakedTokensOnSmartContract(_of, _scAddress, _index);
        uint unlockable = currentStakedTokens.sub(_getStakerStakedTokensOnSmartContract(_of, _scAddress, _index));
        uint alreadyUnlocked;
        (, , , alreadyUnlocked) = td.stakerStakedContracts(_of, _index);
        if (alreadyUnlocked >= unlockable) {
            amount = 0;
        } else {
            amount = unlockable.sub(alreadyUnlocked);
        }
    }

    //Returns 50% of locked CoverNote amount to use as deposit for Claim
    function _getDepositCNAmount(uint _coverId) internal view returns(uint amount) {
        amount = (_getLockedCNAgainstCover(_coverId).mul(50)).div(100);
    }

    /**
    * @dev Returns amount of NXM Tokens locked as Cover Note for given coverId.
    * @param _coverId coverId of the cover.
    */
    function _getLockedCNAgainstCover(uint _coverId) internal view returns(uint) {
        address coverHolder = qd.getCoverMemberAddress(_coverId);
        bytes32 reason = keccak256(abi.encodePacked("CN", coverHolder, _coverId));
        return tc.tokensLockedAtTime(coverHolder, reason, now); 
    }

    /**
    * @dev Returns amount of NXM Tokens locked as Cover Note for given coverId.
    * @param _of address of the coverHolder.
    * @param _coverId coverId of the cover.
    */
    function _getUserLockedCNTokens(address _of, uint _coverId) internal view returns(uint) {
        bytes32 reason = keccak256(abi.encodePacked("CN", _of, _coverId));
        return tc.tokensLockedAtTime(_of, reason, now); 
    }

    /**
    * @dev Internal function to gets remaining amount of staked NXM tokens,
    *      against smartcontract by index
    * @param _stakeAmount address of user
    * @param _stakeDays staked contract address
    * @param _validDays index of staking
    */
    function _calculateStakedTokens(
        uint _stakeAmount,
        uint _stakeDays,
        uint _validDays
    ) 
        internal
        view 
        returns (uint amount)
    {
        uint rf = ((_validDays.sub(_stakeDays)).mul(100000)).div(_validDays);
        amount = (rf.mul(_stakeAmount)).div(100000);
    }
}