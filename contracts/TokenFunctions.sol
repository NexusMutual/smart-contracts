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

pragma solidity 0.5.7;

import "./NXMToken.sol";
import "./Governance.sol";
import "./StakedData.sol";


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
    PoolData internal pd;
    StakedData internal sd;

    uint private constant DECIMAL1E18 = uint(10) ** 18;
    uint private constant minCapFactor = uint(10) ** 21;

    event BurnCATokens(uint claimId, address addr, uint amount);

    constructor(address  _stakeDataAdd) public {
        sd = StakedData(_stakeDataAdd);
    }
    
    /**
     * @dev Sends commission to underwriter on purchase of staked smart contract.
     * @param _scAddress staker address.
     * @param _premiumNXM premium of cover in NXM.
     */
    function updateStakerCommissions(address _scAddress, uint _premiumNXM) external onlyInternal {
        // uint commissionToBePaid = (_premiumNXM.mul(td.stakerCommissionPer())).div(100);
        // uint stakeLength = td.getStakedContractStakersLength(_scAddress);
        // address claimsRewardAddress = ms.getLatestAddress("CR");
        // for (uint i = td.stakedContractCurrentCommissionIndex(_scAddress); i < stakeLength; i++) {
        //     if (commissionToBePaid > 0) {
        //         address stakerAddress;
        //         uint stakeAmt;
        //         uint stakerIndex;
        //         (stakerAddress, ) = td.stakedContractStakers(_scAddress, i);
        //         stakerIndex = td.getStakedContractStakerIndex(_scAddress, i);
        //         stakeAmt = td.getStakerInitialStakedAmountOnContract(stakerAddress, stakerIndex);
        //         uint maxCommission = (stakeAmt.mul(td.stakerMaxCommissionPer())).div(100);
        //         uint commissionEarned;
        //         commissionEarned = td.getStakerEarnedStakeCommission(stakerAddress, stakerIndex);
        //         if (maxCommission > commissionEarned) {
        //             if (maxCommission >= commissionEarned.add(commissionToBePaid)) {
        //                 td.pushEarnedStakeCommissions(stakerAddress, _scAddress, 
        //                     i, commissionToBePaid);
        //                 tc.mint(claimsRewardAddress, commissionToBePaid);
        //                 if (i > 0)
        //                     td.setStakedContractCurrentCommissionIndex(_scAddress, i);
        //                 commissionToBePaid = 0;
        //                 break;
        //             } else {
        //                 td.pushEarnedStakeCommissions(stakerAddress, _scAddress, i,
        //                     maxCommission.sub(commissionEarned));
        //                 tc.mint(claimsRewardAddress, maxCommission.sub(commissionEarned));
        //                 commissionToBePaid = commissionToBePaid.sub(maxCommission.sub(commissionEarned));
        //             }
        //         }
        //     } else
        //         break;
        // }
        // if (commissionToBePaid > 0 && stakeLength > 0)
        //     td.setStakedContractCurrentCommissionIndex(_scAddress, stakeLength.sub(1));
    }

     /**
     * @dev Burns tokens staked against a Smart Contract Cover.
     * Called when a claim submitted against this cover is accepted.
     * @param coverid Cover Id.
     */
    function burnStakerLockedToken(uint coverid, bytes4 curr, uint sumAssured) external onlyInternal {
        // address scAddress;
        // (, scAddress) = qd.getscAddressOfCover(coverid);
        // uint tokenPrice = m1.calculateTokenPrice(curr);
        // uint totalStaker = td.getStakedContractStakersLength(scAddress);
        // uint burnNXMAmount = sumAssured.mul(DECIMAL1E18).div(tokenPrice);
        // address stakerAddress;
        // uint stakerStakedNXM;
        // for (uint i = td.stakedContractCurrentBurnIndex(scAddress); i < totalStaker; i++) {
        //     if (burnNXMAmount > 0) {
        //         stakerAddress = td.getStakedContractStakerByIndex(scAddress, i);
        //         uint stakerIndex = td.getStakedContractStakerIndex(
        //         scAddress, i);
        //         uint v;
        //         (v, stakerStakedNXM) = _unlockableBeforeBurningAndCanBurn(stakerAddress, scAddress, stakerIndex);
        //         td.pushUnlockableBeforeLastBurnTokens(stakerAddress, stakerIndex, v);
        //         if (stakerStakedNXM > 0) {
        //             if (stakerStakedNXM >= burnNXMAmount) {
        //                 _burnStakerTokenLockedAgainstSmartContract(
        //                     stakerAddress, scAddress, i, burnNXMAmount);
        //                 if (i > 0)
        //                     td.setStakedContractCurrentBurnIndex(scAddress, i);
        //                 burnNXMAmount = 0;
        //                 break;
        //             } else {
        //                 _burnStakerTokenLockedAgainstSmartContract(
        //                     stakerAddress, scAddress, i, stakerStakedNXM);
        //                 burnNXMAmount = burnNXMAmount.sub(stakerStakedNXM);
        //             }
        //         }
        //     } else
        //         break;
        // }
        // if (burnNXMAmount > 0 && totalStaker > 0)
        //     td.setStakedContractCurrentBurnIndex(scAddress, totalStaker.sub(1));
    }

    /**
     * @dev Increases tokens staked for risk assessment.
     * Called by user to increase stake amount.
     * @param amount additional stake to be added.
     */
    function increaseStake(uint amount) external {

        // Add check to ensure no pending commission  to claim.
        uint updatedGlobalStake = sd.globalStake(msg.sender).add(amount).sub(sd.globalBurned(msg.sender));
        require(updatedGlobalStake > sd.minStake());
        if(tc.tokensLocked(msg.sender, "RA") == 0)
        {
            tc.lockOf(msg.sender, "RA", amount, uint(2 ** 251).sub(now)); // locking for indefinite time.
        }
        else {
            tc.increaseRALockAmount(msg.sender, amount);
            sd.updateAllocations(msg.sender, amount, false);
        }
        sd.updateGlobalStake(msg.sender, updatedGlobalStake);
        sd.updateGlobalBurn(msg.sender, 0);
        sd.updateLastClaimedforCoverId(msg.sender, qd.getCoverLength());
        
        // sd.updateLastBurnedforClaimId(msg.sender, ); // update last burned for claim id
        // update RA->claimid->burned   
    }

    /**
     * @dev unstakes tokens from tokens staked for risk assessment.
     * Called by user to unstake stake amount.
     * @param amount tokens to be unstake.
     */
    function decreaseStake(uint amount) external {

        require(amount > 0);
        // Add check to ensure no pending commision to claim.
        // update RA->claimid->burned   
        uint maxUnstakeAmount = sd.getMaxUnstakable(msg.sender);
        require(maxUnstakeAmount >= amount);


        uint updatedGlobalStake = sd.globalStake(msg.sender).sub(amount).sub(sd.globalBurned(msg.sender));
        // sd.updateLastBurnedforClaimId(msg.sender, ); // update last burned for claim id

        sd.updateLastClaimedforCoverId(msg.sender, qd.getCoverLength());
        
        require(updatedGlobalStake > sd.minStake() || updatedGlobalStake == 0);

        sd.updateAllocations(msg.sender, amount, true);

        sd.updateGlobalStake(msg.sender, updatedGlobalStake);
        if(sd.globalBurned(msg.sender) > 0){
            sd.updateGlobalBurn(msg.sender, 0);
            // update RA->claimid->burned
        }

        

        tc.releaseLockedTokens(msg.sender, "RA", amount);   
    }

    /**
     * @dev Increases staking allocation against mentioned smart cover.
     * Called by user to increase allocation %.
     * @param scAdd array of smart cover against which allocation to be added.
     * @param percentx100 array of values for additional allocation to be added.
     */
    function increaseAllocation(address[] calldata scAdd, uint[] calldata percentx100) external {
        require(scAdd.length == percentx100.length);
        // Add check to ensure no pending commision to claim.
        uint currentTotalAllocated = sd.userTotalAllocated(msg.sender);
        uint totalAllocationPassed = 0;
        for(uint i = 0;i<scAdd.length;i++)
        {
            require(percentx100[i] > 0);
            totalAllocationPassed = totalAllocationPassed.add(percentx100[i]);
            require(currentTotalAllocated.add(totalAllocationPassed) <= 10000);
            int scUserIndex = sd.getScUserIndex(scAdd[i], msg.sender);
            uint currentAllocated;
            if(scUserIndex == -1)
                currentAllocated = 0;
            else
                (, currentAllocated) = sd.stakerStakedContracts(msg.sender, uint(scUserIndex));
            require(currentAllocated.add(percentx100[i]) >= sd.minAllocationPerx100() && currentAllocated.add(percentx100[i]) <= sd.maxAllocationPerx100());
            uint globalMaxPerContract = getGlobalMaxStakePerContract();
            uint totalStakedOnContract = getTotalStakedTokensOnSmartContract(scAdd[i]);
            uint globalStake = sd.globalStake(msg.sender);
            uint minAllocx100 = percentx100[i];
            if(globalMaxPerContract >= ((globalStake.sub(sd.globalBurned(msg.sender))).mul(minAllocx100).div(10000)).add(totalStakedOnContract))
                minAllocx100 = (globalMaxPerContract.sub(totalStakedOnContract)).mul(10000).div(globalStake);
            if(currentAllocated == 0)
            {
                sd.pushStakeData(msg.sender, scAdd[i], minAllocx100);
            }
            else
            {
                sd.increaseStakeAllocation(msg.sender, scAdd[i], minAllocx100);
            }
        }
    }

    /**
     * @dev Keeps record for decreases staking allocation against mentioned smart cover.
     * Called by user to request for decrease allocation %.
     * @param scAdd array of smart cover against which allocation to be reduced.
     * @param percentx100 array of values for allocation to be reduced.
     */
    function decreaseAllocation(address[] calldata scAdd, uint[] calldata percentx100) external {
        require(scAdd.length == percentx100.length);

        for(uint i = 0;i<scAdd.length;i++)
        {
            int scUserIndex = sd.getScUserIndex(scAdd[i], msg.sender);
            uint currentAllocated;
            if(scUserIndex == -1)
                currentAllocated = 0;
            else
                (, currentAllocated) = sd.stakerStakedContracts(msg.sender, uint(scUserIndex));
            uint minAllocationx100 = percentx100[i];
            if (currentAllocated < minAllocationx100)
                minAllocationx100 = currentAllocated;
            // No need to push if min allocation to reduce is 0.
            if (minAllocationx100 > 0)
                sd.pushDecreaseAllocationRequest(msg.sender, scAdd[i], minAllocationx100);
        }
        
    }

    /**
     * @dev Triggers action for decreases staking allocation against available records for mentioned user.
     * Called by anyone to trigger decrease allocation % for all records which completed disallocateEffectTime time.
     * @param userAdd User address.
     */
    function disAllocate(address userAdd) external {

        // send pending rewards.
        uint len = sd.getDissallocationLen(userAdd);
        uint i = sd.userDisallocationExecuted(userAdd);
        for(; i < len; i++)
        {
            uint timeStamp;
            address smartContract;
            uint percentx100;
            (smartContract, percentx100, timeStamp) = sd.userDisallocationRequest(userAdd, i);
            if(timeStamp <= now)
            {
                int scUserIndex = sd.getScUserIndex(smartContract, userAdd);
                uint currentAllocated;
                if(scUserIndex == -1)
                    currentAllocated = 0;
                else
                    (, currentAllocated) = sd.stakerStakedContracts(msg.sender, uint(scUserIndex));
                if(percentx100 > currentAllocated)
                {
                    percentx100 = currentAllocated;
                }
                else if(currentAllocated.sub(percentx100) > 0 && currentAllocated.sub(percentx100) < sd.minAllocationPerx100())
                {
                    percentx100 = currentAllocated.sub(sd.minAllocationPerx100());
                }

                // No need to call if min allocation to reduce is 0.
                if(percentx100 > 0)
                    sd.decreaseStakeAllocation(userAdd, smartContract, percentx100);
                    
            }
            else {
                // As all records are in ascending order, So if timeStamp of current index is > now, 
                // all the timestamps after will be >= it.
                break; 
            }

            
        }
        sd.setUserDisallocationExecuted(userAdd, i);
        
    }

    /**
     * @dev Gets maximum amount stakable against particular smart contract.
     * @return limit max stakable.
     */
    function getGlobalMaxStakePerContract() public view returns(uint limit)
    {
        limit = sd.globalMaxStakeMultiplier().mul(pd.capacityLimit()).mul(((m1.variableMincap().mul(minCapFactor)).add(pd.minCap()))).mul(DECIMAL1E18).div(m1.calculateTokenPrice("ETH")); //2 x Min Cap ETH x Capacity Limit / tokenPrice
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
        public
        view
        returns(uint amount)
    {
        amount = sd.getTotalStakedTokensOnSmartContract(_stakedContractAddress);
    }

    /**
     * @dev Returns amount of NXM Tokens locked as Cover Note for given coverId.
     * @param _of address of the coverHolder.
     * @param _coverId coverId of the cover.
     */
    function getUserLockedCNTokens(address _of, uint _coverId) external view returns(uint) {
        return _getUserLockedCNTokens(_of, _coverId);
    } 

    /**
     * @dev to get the all the cover locked tokens of a user 
     * @param _of is the user address in concern
     * @return amount locked
     */
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
            uint currentlyStaked;
            (, currentlyStaked) = _unlockableBeforeBurningAndCanBurn(_stakerAddress, scAddress, i);
            stakedAmount = stakedAmount.add(currentlyStaked);
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
        pd = PoolData(ms.getLatestAddress("PD"));

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

    /**
     * @dev to burn the deposited cover tokens 
     * @param coverId is id of cover whose tokens have to be burned
     * @return the status of the successful burning
     */
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
     * @dev to lock cover note tokens
     * @param coverNoteAmount is number of tokens to be locked
     * @param coverPeriod is cover period in concern
     * @param coverId is the cover id of cover in concern
     * @param _of address whose tokens are to be locked
     */
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

    /**
     * @dev to check if a  member is locked for member vote 
     * @param _of is the member address in concern
     * @return the boolean status
     */
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
            scIndex);
            td.setUnlockableBeforeLastBurnTokens(_stakerAddress, i, 0);
            td.pushUnlockedStakedTokens(_stakerAddress, i, unlockableAmount);
            reason = keccak256(abi.encodePacked("UW", _stakerAddress, scAddress, scIndex));
            tc.releaseLockedTokens(_stakerAddress, reason, unlockableAmount);
        }
    }

    /**
     * @dev to get tokens of staker locked before burning that are allowed to burn 
     * @param stakerAdd is the address of the staker 
     * @param stakedAdd is the address of staked contract in concern 
     * @param stakerIndex is the staker index in concern
     * @return amount of unlockable tokens
     * @return amount of tokens that can burn
     */
    function _unlockableBeforeBurningAndCanBurn(
        address stakerAdd, 
        address stakedAdd, 
        uint stakerIndex
    )
    internal 
    view 
    returns
    (uint amount, uint canBurn) {

        uint dateAdd;
        uint initialStake;
        uint totalBurnt;
        uint ub;
        (, , dateAdd, initialStake, , totalBurnt, ub) = td.stakerStakedContracts(stakerAdd, stakerIndex);
        canBurn = _calculateStakedTokens(initialStake, (now.sub(dateAdd)).div(1 days), td.scValidDays());
        // Can't use SafeMaths for int.
        int v = int(initialStake - (canBurn) - (totalBurnt) - (
            td.getStakerUnlockedStakedTokens(stakerAdd, stakerIndex)) - (ub));
        uint currentLockedTokens = _getStakerLockedTokensOnSmartContract(
            stakerAdd, stakedAdd, td.getStakerStakedContractIndex(stakerAdd, stakerIndex));
        if (v < 0)
            v = 0;
        amount = uint(v);
        if (canBurn > currentLockedTokens.sub(amount).sub(ub))
            canBurn = currentLockedTokens.sub(amount).sub(ub);
    }

    /**
     * @dev to get tokens of staker that are unlockable
     * @param _stakerAddress is the address of the staker 
     * @param _stakedContractAddress is the address of staked contract in concern 
     * @param _stakedContractIndex is the staked contract index in concern
     * @return amount of unlockable tokens
     */
    function _getStakerUnlockableTokensOnSmartContract (
        address _stakerAddress,
        address _stakedContractAddress,
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
        uint burnt;
        (, , , initialStake, , burnt,) = td.stakerStakedContracts(_stakerAddress, stakerIndex);
        uint alreadyUnlocked = td.getStakerUnlockedStakedTokens(_stakerAddress, stakerIndex);
        uint currentStakedTokens;
        (, currentStakedTokens) = _unlockableBeforeBurningAndCanBurn(_stakerAddress, 
            _stakedContractAddress, stakerIndex);
        amount = initialStake.sub(currentStakedTokens).sub(alreadyUnlocked).sub(burnt);
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
        amount = tc.tokensLocked(_stakerAddress, reason);
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
        if (_validDays > _stakeDays) {
            uint rf = ((_validDays.sub(_stakeDays)).mul(100000)).div(_validDays);
            amount = (rf.mul(_stakeAmount)).div(100000);
        } else 
            amount = 0;
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
        uint stakerIndex = td.getStakedContractStakerIndex(
            _stakedContractAddress, _stakedContractIndex);
        td.pushBurnedTokens(_stakerAddress, stakerIndex, _amount);
        bytes32 reason = keccak256(abi.encodePacked("UW", _stakerAddress,
            _stakedContractAddress, _stakedContractIndex));
        tc.burnLockedTokens(_stakerAddress, reason, _amount);
    }

}