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
import "./imports/openzeppelin-solidity/math/SafeMath.sol";
import "./MemberRoles.sol";
import "./Iupgradable.sol";
import "./Governance.sol";


contract TokenFunctions is Iupgradable {
    using SafeMath for uint;

    MCR internal m1;
    MemberRoles internal mr;
    NXMToken public tk;
    TokenController internal tc;
    TokenData internal td;
    QuotationData internal qd;
    ClaimsReward internal cr;
    Governance internal gv;

    uint private constant DECIMAL1E18 = uint(10) ** 18;

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

    event BurnCATokens(uint claimId, address addr, uint amount);
    
    /**
     * @dev Sends commission to underwriter on purchase of staked smart contract.
     * @param _scAddress staker address.
     * @param _premiumNXM premium of cover in NXM.
     */
    function updateStakerCommissions(address _scAddress, uint _premiumNXM) external onlyInternal {
        uint commissionToBePaid = (_premiumNXM.mul(td.stakerCommissionPer())).div(100);
        uint stakeLength = td.getStakedContractStakersLength(_scAddress);
        address claimsRewardAddress = ms.getLatestAddress("CR");
        for (uint i = td.stakedContractCurrentCommissionIndex(_scAddress); i < stakeLength; i++) {
            if (commissionToBePaid > 0) {
                address stakerAddress;
                uint stakeAmt;
                uint stakerIndex;
                (stakerAddress, ) = td.stakedContractStakers(_scAddress, i);
                stakerIndex = td.getStakedContractStakerIndex(_scAddress, i);
                stakeAmt = td.getStakerInitialStakedAmountOnContract(stakerAddress, stakerIndex);
                uint maxCommission = (stakeAmt.mul(td.stakerMaxCommissionPer())).div(100);
                uint commissionEarned;
                commissionEarned = td.getStakerEarnedStakeCommission(stakerAddress, stakerIndex);
                if (maxCommission > commissionEarned) {
                    if (maxCommission >= commissionEarned.add(commissionToBePaid)) {
                        td.pushEarnedStakeCommissions(stakerAddress, _scAddress, 
                            i, commissionToBePaid);
                        tc.mint(claimsRewardAddress, commissionToBePaid);
                        if (i > 0)
                            td.setStakedContractCurrentCommissionIndex(_scAddress, i);
                        commissionToBePaid = 0;
                        break;
                    } else {
                        td.pushEarnedStakeCommissions(stakerAddress, _scAddress, i,
                            maxCommission.sub(commissionEarned));
                        tc.mint(claimsRewardAddress, maxCommission.sub(commissionEarned));
                        commissionToBePaid = commissionToBePaid.sub(maxCommission.sub(commissionEarned));
                    }
                }
            } else
                break;
        }
        if (commissionToBePaid > 0 && stakeLength > 0)
            td.setStakedContractCurrentCommissionIndex(_scAddress, stakeLength.sub(1));
    }
mapping (address=>uint[]) burnDates;
     /**
     * @dev Burns tokens staked against a Smart Contract Cover.
     * Called when a claim submitted against this cover is accepted.
     * @param coverid Cover Id.
     */
    function burnStakerLockedToken(uint coverid, bytes4 curr, uint sumAssured) external onlyInternal {
        address scAddress;
        (, scAddress) = qd.getscAddressOfCover(coverid);
        uint tokenPrice = m1.calculateTokenPrice(curr);
        uint totalStaker = td.getStakedContractStakersLength(scAddress);
        uint burnNXMAmount = sumAssured.mul(DECIMAL1E18).div(tokenPrice);
        address stakerAddress;
        uint stakerStakedNXM;
        burnDates[scAddress].push(now);
        for (uint i = td.stakedContractCurrentBurnIndex(scAddress); i < totalStaker; i++) {
            if (burnNXMAmount > 0) {
                stakerAddress = td.getStakedContractStakerByIndex(scAddress, i);
            //     stakerStakedNXM = _getStakerLockedTokensOnSmartContract(
            // stakerAddress, scAddress, i).sub(_getStakerUnlockableTokensOnSmartContract(
            //         stakerAddress, scAddress, i));
          stakerStakedNXM =  _getStakerStakedTokensOnSmartContract(stakerAddress, scAddress, i);
                if (stakerStakedNXM > 0) {
                    if (stakerStakedNXM >= burnNXMAmount) {
                        _burnStakerTokenLockedAgainstSmartContract(
                            stakerAddress, scAddress, i, burnNXMAmount);
                        if (i > 0)
                            td.setStakedContractCurrentBurnIndex(scAddress, i);
                        burnNXMAmount = 0;
                        break;
                    } else {
                        _burnStakerTokenLockedAgainstSmartContract(
                            stakerAddress, scAddress, i, stakerStakedNXM);
                        burnNXMAmount = burnNXMAmount.sub(stakerStakedNXM);
                    }
                }
            } else
                break;
        }
        if (burnNXMAmount > 0 && totalStaker > 0)
            td.setStakedContractCurrentBurnIndex(scAddress, totalStaker.sub(1));
    }

    /**
     * @dev Gets the total staked NXM tokens against
     * Smart contract by all stakers
     * @param _stakedContractAddress smart contract address.
     * @return amount total staked NXM tokens.
     */
    function getTotalStakedTokensOnSmartContract(
        address _stakedContractAddress
    )
        external
        view
        returns(uint amount)
    {
        uint stakedAmount = 0;
        address stakerAddress;
        for (uint i = 0; i < td.getStakedContractStakersLength(_stakedContractAddress); i++) {
            stakerAddress = td.getStakedContractStakerByIndex(_stakedContractAddress, i);
            stakedAmount = stakedAmount.add(_getStakerStakedTokensOnSmartContract(
                stakerAddress, _stakedContractAddress, i));
        } 
        amount = stakedAmount;
    }

    /**
     * @dev Returns amount of NXM Tokens locked as Cover Note for given coverId.
     * @param _of address of the coverHolder.
     * @param _coverId coverId of the cover.
     */
    function getUserLockedCNTokens(address _of, uint _coverId) external view returns(uint) {
        return _getUserLockedCNTokens(_of, _coverId);
    } 

    function getUserAllLockedCNTokens(address _of) external view returns(uint amount) {
        for (uint i = 0; i < qd.getUserCoverLength(_of); i++) {
            amount = amount.add(_getUserLockedCNTokens(_of, qd.getAllCoversOfUser(_of)[i]));
        }
    }

    /**
     * @dev Returns amount of NXM Tokens locked as Cover Note against given coverId.
     * @param _coverId coverId of the cover.
     */
    function getLockedCNAgainstCover(uint _coverId) external view returns(uint) {
        return _getLockedCNAgainstCover(_coverId);
    }

    /**
     * @dev Returns total amount of staked NXM Tokens on all smart contract .
     * @param _stakerAddress address of the Staker.
     */ 
    function getStakerAllLockedTokens(address _stakerAddress) external view returns (uint amount) {
        uint stakedAmount = 0;
        address scAddress;
        uint scIndex;
        for (uint i = 0; i < td.getStakerStakedContractLength(_stakerAddress); i++) {
            scAddress = td.getStakerStakedContractByIndex(_stakerAddress, i);
            scIndex = td.getStakerStakedContractIndex(_stakerAddress, i);
            stakedAmount = stakedAmount.add(_getStakerLockedTokensOnSmartContract(
                _stakerAddress, scAddress, scIndex));
        }
        amount = stakedAmount;
    }

    /**
     * @dev Returns total unlockable amount of staked NXM Tokens on all smart contract .
     * @param _stakerAddress address of the Staker.
     */ 
    function getStakerAllUnlockableStakedTokens(
        address _stakerAddress
    )
        external
        view
        returns (uint amount)
    {
        uint unlockableAmount = 0;
        address scAddress;
        uint scIndex;
        for (uint i = 0; i < td.getStakerStakedContractLength(_stakerAddress); i++) {
            scAddress = td.getStakerStakedContractByIndex(_stakerAddress, i);
            scIndex = td.getStakerStakedContractIndex(_stakerAddress, i);
            unlockableAmount = unlockableAmount.add(
                _getStakerUnlockableTokensOnSmartContract(_stakerAddress, scAddress,
                 // i,
                  scIndex));
        }
        amount = unlockableAmount;
    }

    /**
     * @dev Change Dependent Contract Address
     */
    function changeDependentContractAddress() public {
        tk = NXMToken(ms.tokenAddress());
        td = TokenData(ms.getLatestAddress("TD"));
        tc = TokenController(ms.getLatestAddress("TC"));
        cr = ClaimsReward(ms.getLatestAddress("CR"));
        qd = QuotationData(ms.getLatestAddress("QD"));
        m1 = MCR(ms.getLatestAddress("MC"));
        gv = Governance(ms.getLatestAddress("GV"));
        mr = MemberRoles(ms.getLatestAddress("MR"));
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
     * @dev Set the flag to check if cover note is deposited against the cover id
     * @param coverId Cover Id.
     */ 
    function depositCN(uint coverId) public onlyInternal returns (bool success) {
        require(_getLockedCNAgainstCover(coverId) > 0, "No cover note available");
        td.setDepositCN(coverId, true);
        success = true;    
    }

    /**
     * @param _of address of Member
     * @param _coverId Cover Id
     * @param _lockTime Pending Time + Cover Period 7*1 days
     */ 
    function extendCNEPOff(address _of, uint _coverId, uint _lockTime) public onlyInternal {
        uint timeStamp = now.add(_lockTime);
        uint coverValidUntil = qd.getValidityOfCover(_coverId);
        if (timeStamp >= coverValidUntil) {
            bytes32 reason = keccak256(abi.encodePacked("CN", _of, _coverId));
            tc.extendLockOf(_of, reason, timeStamp);
        } 
    }

    function burnDepositCN(uint coverId) public onlyInternal returns (bool success) {
        address _of = qd.getCoverMemberAddress(coverId);
        uint amount;
        (amount, ) = td.depositedCN(coverId);
        amount = (amount.mul(50)).div(100);
        bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
        tc.burnLockedTokens(_of, reason, amount);
        success = true;
    }

    /**
     * @dev Unlocks covernote locked against a given cover 
     * @param coverId id of cover
     */ 
    function unlockCN(uint coverId) public onlyInternal {
        address _of = qd.getCoverMemberAddress(coverId);
        uint lockedCN = _getLockedCNAgainstCover(coverId);
        if (lockedCN != 0) {
            bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
            tc.releaseLockedTokens(_of, reason, lockedCN);
        }
    }

    /** 
     * @dev Burns tokens used for fraudulent voting against a claim
     * @param claimid Claim Id.
     * @param _value number of tokens to be burned
     * @param _of Claim Assessor's address.
     */     
    function burnCAToken(uint claimid, uint _value, address _of) public {

        require(ms.checkIsAuthToGoverned(msg.sender));
        tc.burnLockedTokens(_of, "CLA", _value);
        emit BurnCATokens(claimid, _of, _value);
    }

    /**
     * @dev Change the address who can update GovBlocks member role.
     * Called when updating to a new version.
     * Need to remove onlyOwner to onlyInternal and update automatically at version change
     */
    function changeCanAddMemberAddress(address _newAdd) public onlyOwner {
        mr.changeAuthorized(uint(MemberRoles.Role.Member), _newAdd);
    }

    /** 
     * @dev Called by user to pay joining membership fee
     */ 
    function payJoiningFee(address _userAddress) public payable checkPause {
        if (msg.sender == address(ms.getLatestAddress("QT"))) {
            require(td.walletAddress() != address(0), "No walletAddress present");
            td.walletAddress().transfer(msg.value); 
            tc.addToWhitelist(_userAddress);
            mr.updateRole(_userAddress, uint(MemberRoles.Role.Member), true);
        } else {
            require(!qd.refundEligible(_userAddress));
            require(mr.totalRoles() > 0, "No member roles found");
            require(!ms.isMember(_userAddress));
            require(msg.value == td.joiningFee());
            qd.setRefundEligible(_userAddress, true);
        }
    }

    function kycVerdict(address _userAddress, bool verdict) public checkPause {
        require(!ms.isMember(_userAddress));
        require(qd.refundEligible(_userAddress));
        if (verdict) {
            qd.setRefundEligible(_userAddress, false);
            uint fee = td.joiningFee();
            require(td.walletAddress().send(fee)); //solhint-disable-line
            tc.addToWhitelist(_userAddress);
            mr.updateRole(_userAddress, uint(MemberRoles.Role.Member), true);
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
        require(!isLockedForMemberVote(msg.sender)); // No locked tokens for Member/Governance voting
        require(cr.getAllPendingRewardOfUser(msg.sender) == 0); // No pending reward to be claimed(claim assesment).
        gv.removeDelegation(msg.sender);
        tc.burnFrom(msg.sender, tk.balanceOf(msg.sender));
        mr.updateRole(msg.sender, uint(MemberRoles.Role.Member), false);
        tc.removeFromWhitelist(msg.sender); // need clarification on whitelist
        
    }

    function lockCN(
        uint coverNoteAmount,
        uint coverPeriod,
        uint coverId,
        address _of
    )
        public
        onlyInternal
    {
        uint validity = now.add(coverPeriod * 1 days).add(td.lockTokenTimeAfterCoverExp());
        bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
        td.setDepositCNAmount(coverId, coverNoteAmount);
        tc.lockOf(_of, reason, coverNoteAmount, validity);
    }

    /**
     * @dev In case of new NXMToken we have to add all members in Whitelist again. 
     */ 
    function addAllMembersInWhiteList() public onlyOwner {
        address[] memory allMemebrs = new address[](mr.numberOfMembers(uint(MemberRoles.Role.Member)));
        (, allMemebrs) = mr.members(uint(MemberRoles.Role.Member));
        for (uint i = 0; i < allMemebrs.length; i++) {
            tc.addToWhitelist(allMemebrs[i]);
        }

    }

    /**
     * @dev Staking on contract.
     * @param _scAddress smart contract address.
     * @param _amount amount of NXM.
     */ 
    function addStake(address _scAddress, uint _amount) public isMemberAndcheckPause {
        uint scIndex = td.addStake(msg.sender, _scAddress, _amount);
        uint validity = (td.scValidDays()).mul(1 days);
        bytes32 reason = keccak256(abi.encodePacked("UW", msg.sender, _scAddress, scIndex));
        tc.lockOf(msg.sender, reason, _amount, validity);
    }

    function isLockedForMemberVote(address _of) public view returns(bool) {
        return now < tk.isLockedForMV(_of);
    }

    /**
     * @dev Internal function to gets amount of locked NXM tokens,
     * staked against smartcontract by index
     * @param _stakerAddress address of user
     * @param _stakedContractAddress staked contract address
     * @param _stakedContractIndex index of staking
     */
    function getStakerLockedTokensOnSmartContract (
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakedContractIndex
    )
        public
        view
        returns
        (uint amount)
    {   
        amount = _getStakerLockedTokensOnSmartContract(_stakerAddress,
            _stakedContractAddress, _stakedContractIndex);
    }

    /**
     * @dev Function to gets unlockable amount of locked NXM 
     * tokens, staked against smartcontract by index
     * @param stakerAddress address of staker
     * @param stakedContractAddress staked contract address
     * @param stakerIndex index of staking
     */
    function getStakerUnlockableTokensOnSmartContract (
        address stakerAddress,
        address stakedContractAddress,
        uint stakerIndex
    ) 
        public
        view
        returns (uint)
    {
        return _getStakerUnlockableTokensOnSmartContract(stakerAddress, stakedContractAddress,
            // stakerIndex,
             td.getStakerStakedContractIndex(stakerAddress, stakerIndex));
    }

    /**
     * @dev releases unlockable staked tokens to staker 
     */
    function unlockStakerUnlockableTokens(address _stakerAddress) public onlyInternal {
        uint unlockableAmount;
        address scAddress;
        bytes32 reason;
        uint scIndex;
        for (uint i = 0; i < td.getStakerStakedContractLength(_stakerAddress); i++) {
            scAddress = td.getStakerStakedContractByIndex(_stakerAddress, i);
            scIndex = td.getStakerStakedContractIndex(_stakerAddress, i);
            unlockableAmount = _getStakerUnlockableTokensOnSmartContract(
                _stakerAddress, scAddress,
                 // i,
                 scIndex);
            td.pushUnlockedStakedTokens(_stakerAddress, i, unlockableAmount);
            reason = keccak256(abi.encodePacked("UW", _stakerAddress, scAddress, scIndex));
            tc.releaseLockedTokens(_stakerAddress, reason, unlockableAmount);
        }
    }

    /**
     * @dev Internal function to gets unlockable amount of locked NXM 
     * tokens, staked against smartcontract by index
     * @param _stakerAddress address of staker
     * @param _stakedContractAddress staked contract address
     
     */
    // function _getStakerUnlockableTokensOnSmartContract (
    //     address _stakerAddress,
    //     address _stakedContractAddress,
    //     // uint _stakerIndex,
    //     uint _stakedContractIndex
    // ) 
    //     internal
    //     view
    //     returns
    //     (uint amount)
    // {   
    //     // uint initialStake;
    //     // (, , , initialStake,) = td.stakerStakedContracts(_stakerAddress, _stakerIndex);
    //     uint currentLockedTokens = _getStakerLockedTokensOnSmartContract(
    //         _stakerAddress, _stakedContractAddress, _stakedContractIndex);
    //     amount = currentLockedTokens.sub(
    //         _getStakerStakedTokensOnSmartContract(_stakerAddress,
    //             _stakedContractAddress, _stakedContractIndex));
    //     // uint alreadyUnlocked = td.getStakerUnlockedStakedTokens(_stakerAddress, _stakerIndex); //sIndex
    //     // if (alreadyUnlocked >= unlockable) {
    //     //     amount = 0;
    //     // } else {
    //     //     amount = currentLockedTokens.sub(alreadyUnlocked);
    //     //     if(amount > currentLockedTokens)
    //     //         amount = currentLockedTokens;
    //     // }
    // }

    function _getStakerUnlockableTokensOnSmartContract (
        address _stakerAddress,
        address _stakedContractAddress,
        // uint _stakerIndex,
        uint _stakedContractIndex
    ) 
        internal
        view
        returns
        (uint amount)
    {   
        uint initialStake;
        uint stakerIndex = td.getStakedContractStakerIndex(
            _stakedContractAddress, _stakedContractIndex);
        (, , , initialStake,) = td.stakerStakedContracts(_stakerAddress, stakerIndex);
        uint alreadyUnlocked = td.getStakerUnlockedStakedTokens(_stakerAddress, stakerIndex); //sIndex
        uint currentLockedTokens = _getStakerLockedTokensOnSmartContract(
            _stakerAddress, _stakedContractAddress, _stakedContractIndex);
        amount = initialStake.sub(
            _getStakerStakedTokensOnSmartContract(_stakerAddress,
                _stakedContractAddress, _stakedContractIndex)).sub(alreadyUnlocked);
        
        // if (alreadyUnlocked >= unlockable) {
        //     amount = 0;
        // } else {
        //     amount = currentLockedTokens.sub(alreadyUnlocked);
        //     if(amount > currentLockedTokens)
        //         amount = currentLockedTokens;
        // }
    }

    /**
     * @dev Internal function to get the amount of staked NXM 
     * tokens against smartcontract by index
     * @param _stakerAddress address of user
     * @param _stakedContractAddress staked contract address
     * @param _stakedContractIndex index of staking
     */
    // function _getStakerStakedTokensOnSmartContract (
    //     address _stakerAddress,
    //     address _stakedContractAddress,
    //     uint _stakedContractIndex
    // )
    //     internal
    //     view
    //     returns
    //     (uint amount)
    // {   
    //     uint dateAdd;
    //     uint stakerIndex = td.getStakedContractStakerIndex(
    //         _stakedContractAddress, _stakedContractIndex);
    //     uint alreadyUnlocked = td.getStakerUnlockedStakedTokens(_stakerAddress, stakerIndex);
    //     uint initialStake;
    //     (, , dateAdd, initialStake,) = td.stakerStakedContracts(_stakerAddress, stakerIndex);
    //     uint validDays = td.scValidDays();
    //     uint currentLockedTokens = _getStakerLockedTokensOnSmartContract(
    //         _stakerAddress, _stakedContractAddress, _stakedContractIndex);
    //     uint dayStaked = (now.sub(dateAdd)).div(1 days);
    //     if (currentLockedTokens == 0) {
    //         amount = 0;
    //     } else if (validDays > dayStaked) {
    //         amount = _calculateStakedTokens(initialStake, dayStaked, validDays);
    //         if (currentLockedTokens < amount) {
    //             amount = currentLockedTokens;
    //         }
    //     } 
    // }

    function _getStakerStakedTokensOnSmartContract (
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakedContractIndex
    )
        internal
        view
        returns
        (uint amount)
    {   
        uint dateAdd;
        uint stakerIndex = td.getStakedContractStakerIndex(
            _stakedContractAddress, _stakedContractIndex);
        uint alreadyUnlocked = td.getStakerUnlockedStakedTokens(_stakerAddress, stakerIndex);
        uint initialStake;
        (, , dateAdd, initialStake,) = td.stakerStakedContracts(_stakerAddress, stakerIndex);
        uint validDays = td.scValidDays();
        uint currentLockedTokens = _getStakerLockedTokensOnSmartContract(
            _stakerAddress, _stakedContractAddress, _stakedContractIndex);
        uint dayStaked = (now.sub(dateAdd)).div(1 days);
        if (currentLockedTokens == 0) {
            amount = 0;
        } else if (validDays > dayStaked) {
            amount = _calculateStakedTokens(initialStake, dayStaked, validDays);
            // if (currentLockedTokens < amount) {
            //     amount = currentLockedTokens;
            // }
        } 
    }

    /**
     * @dev Internal function to get the amount of locked NXM tokens,
     * staked against smartcontract by index
     * @param _stakerAddress address of user
     * @param _stakedContractAddress staked contract address
     * @param _stakedContractIndex index of staking
     */
    function _getStakerLockedTokensOnSmartContract (
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakedContractIndex
    )
        internal
        view
        returns
        (uint amount)
    {   
        bytes32 reason = keccak256(abi.encodePacked("UW", _stakerAddress,
            _stakedContractAddress, _stakedContractIndex));
        amount = tc.tokensLockedAtTime(_stakerAddress, reason, now);
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
     * against smartcontract by index
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
        pure 
        returns (uint amount)
    {
        uint rf = ((_validDays.sub(_stakeDays)).mul(100000)).div(_validDays);
        amount = (rf.mul(_stakeAmount)).div(100000);
    }

    /**
     * @dev Gets the total staked NXM tokens against Smart contract 
     * by all stakers
     * @param _stakedContractAddress smart contract address.
     * @return amount total staked NXM tokens.
     */
    function _burnStakerTokenLockedAgainstSmartContract(
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakedContractIndex,
        uint _amount
    ) 
        internal
    {
        bytes32 reason = keccak256(abi.encodePacked("UW", _stakerAddress,
            _stakedContractAddress, _stakedContractIndex));
        tc.burnLockedTokens(_stakerAddress, reason, _amount);
    }

}