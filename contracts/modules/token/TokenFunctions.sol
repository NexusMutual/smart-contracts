/* Copyright (C) 2020 NexusMutual.io

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

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../interfaces/IPooledStaking.sol";
import "../capital/MCR.sol";
import "../capital/PoolData.sol";
import "../claims/ClaimsReward.sol";
import "../governance/Governance.sol";
import "./NXMToken.sol";
import "./TokenController.sol";
import "./TokenData.sol";


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
    IPooledStaking pooledStaking;

    event BurnCATokens(uint claimId, address addr, uint amount);

    /**
     * @dev Rewards stakers on purchase of cover on smart contract.
     * @param _contractAddress smart contract address.
     * @param _coverPriceNXM cover price in NXM.
     */
    function pushStakerRewards(address _contractAddress, uint _coverPriceNXM) external onlyInternal {
        uint rewardValue = _coverPriceNXM.mul(td.stakerCommissionPer()).div(100);
        pooledStaking.pushReward(_contractAddress, rewardValue);
    }

    /**
    * @dev Deprecated in favor of burnStakedTokens
    */
    function burnStakerLockedToken(uint, bytes4, uint) external {
        // noop
    }

    /**
    * @dev Burns tokens staked on smart contract covered by coverId. Called when a payout is succesfully executed.
    * @param coverId cover id
    * @param coverCurrency cover currency
    * @param sumAssured amount of $curr to burn
    */
    function burnStakedTokens(uint coverId, bytes4 coverCurrency, uint sumAssured) external onlyInternal {
        (, address scAddress) = qd.getscAddressOfCover(coverId);
        uint tokenPrice = m1.calculateTokenPrice(coverCurrency);
        uint burnNXMAmount = sumAssured.mul(1e18).div(tokenPrice);
        pooledStaking.pushBurn(scAddress, burnNXMAmount);
    }

    /**
     * @dev Gets the total staked NXM tokens against
     * Smart contract by all stakers
     * @param _stakedContractAddress smart contract address.
     * @return amount total staked NXM tokens.
     */
    function deprecated_getTotalStakedTokensOnSmartContract(
        address _stakedContractAddress
    )
        external
        view
        returns(uint)
    {
        uint stakedAmount = 0;
        address stakerAddress;
        uint staketLen = td.getStakedContractStakersLength(_stakedContractAddress);

        for (uint i = 0; i < staketLen; i++) {
            stakerAddress = td.getStakedContractStakerByIndex(_stakedContractAddress, i);
            uint stakerIndex = td.getStakedContractStakerIndex(
                _stakedContractAddress, i);
            uint currentlyStaked;
            (, currentlyStaked) = _deprecated_unlockableBeforeBurningAndCanBurn(stakerAddress,
                _stakedContractAddress, stakerIndex);
            stakedAmount = stakedAmount.add(currentlyStaked);
        }

        return stakedAmount;
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
     * @dev Returns total amount of staked NXM Tokens on all smart contracts.
     * @param _stakerAddress address of the Staker.
     */ 
    function deprecated_getStakerAllLockedTokens(address _stakerAddress) external view returns (uint amount) {
        uint stakedAmount = 0;
        address scAddress;
        uint scIndex;
        for (uint i = 0; i < td.getStakerStakedContractLength(_stakerAddress); i++) {
            scAddress = td.getStakerStakedContractByIndex(_stakerAddress, i);
            scIndex = td.getStakerStakedContractIndex(_stakerAddress, i);
            uint currentlyStaked;
            (, currentlyStaked) = _deprecated_unlockableBeforeBurningAndCanBurn(_stakerAddress, scAddress, i);
            stakedAmount = stakedAmount.add(currentlyStaked);
        }
        amount = stakedAmount;
    }

    /**
     * @dev Returns total unlockable amount of staked NXM Tokens on all smart contract .
     * @param _stakerAddress address of the Staker.
     */
    function deprecated_getStakerAllUnlockableStakedTokens(
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
                _deprecated_getStakerUnlockableTokensOnSmartContract(_stakerAddress, scAddress,
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
        pooledStaking = IPooledStaking(ms.getLatestAddress("PS"));
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
        (, bool isDeposited) = td.depositedCN(coverId);
        require(!isDeposited,"Cover note is deposited and can not be released");
        uint lockedCN = _getLockedCNAgainstCover(coverId);
        if (lockedCN != 0) {
            address coverHolder = qd.getCoverMemberAddress(coverId);
            bytes32 reason = keccak256(abi.encodePacked("CN", coverHolder, coverId));
            tc.releaseLockedTokens(coverHolder, reason, lockedCN);
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
        uint validity = (coverPeriod * 1 days).add(td.lockTokenTimeAfterCoverExp());
        bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
        td.setDepositCNAmount(coverId, coverNoteAmount);
        tc.lockOf(_of, reason, coverNoteAmount, validity);
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
    function deprecated_getStakerLockedTokensOnSmartContract (
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakedContractIndex
    )
        public
        view
        returns
        (uint amount)
    {
        amount = _deprecated_getStakerLockedTokensOnSmartContract(_stakerAddress,
            _stakedContractAddress, _stakedContractIndex);
    }

    /**
     * @dev Function to gets unlockable amount of locked NXM
     * tokens, staked against smartcontract by index
     * @param stakerAddress address of staker
     * @param stakedContractAddress staked contract address
     * @param stakerIndex index of staking
     */
    function deprecated_getStakerUnlockableTokensOnSmartContract (
        address stakerAddress,
        address stakedContractAddress,
        uint stakerIndex
    )
        public
        view
        returns (uint)
    {
        return _deprecated_getStakerUnlockableTokensOnSmartContract(stakerAddress, stakedContractAddress,
        td.getStakerStakedContractIndex(stakerAddress, stakerIndex));
    }

    /**
     * @dev releases unlockable staked tokens to staker 
     */
    function deprecated_unlockStakerUnlockableTokens(address _stakerAddress) public checkPause {
        uint unlockableAmount;
        address scAddress;
        bytes32 reason;
        uint scIndex;
        for (uint i = 0; i < td.getStakerStakedContractLength(_stakerAddress); i++) {
            scAddress = td.getStakerStakedContractByIndex(_stakerAddress, i);
            scIndex = td.getStakerStakedContractIndex(_stakerAddress, i);
            unlockableAmount = _deprecated_getStakerUnlockableTokensOnSmartContract(
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
    function _deprecated_unlockableBeforeBurningAndCanBurn(
        address stakerAdd, 
        address stakedAdd, 
        uint stakerIndex
    )
    public
    view
    returns
    (uint amount, uint canBurn) {

        uint dateAdd;
        uint initialStake;
        uint totalBurnt;
        uint ub;
        (, , dateAdd, initialStake, , totalBurnt, ub) = td.stakerStakedContracts(stakerAdd, stakerIndex);
        canBurn = _deprecated_calculateStakedTokens(initialStake, now.sub(dateAdd).div(1 days), td.scValidDays());
        // Can't use SafeMaths for int.
        int v = int(initialStake - (canBurn) - (totalBurnt) - (
            td.getStakerUnlockedStakedTokens(stakerAdd, stakerIndex)) - (ub));
        uint currentLockedTokens = _deprecated_getStakerLockedTokensOnSmartContract(
            stakerAdd, stakedAdd, td.getStakerStakedContractIndex(stakerAdd, stakerIndex));
        if (v < 0) {
            v = 0;
        }
        amount = uint(v);
        if (canBurn > currentLockedTokens.sub(amount).sub(ub)) {
            canBurn = currentLockedTokens.sub(amount).sub(ub);
        }
    }

    /**
     * @dev to get tokens of staker that are unlockable
     * @param _stakerAddress is the address of the staker 
     * @param _stakedContractAddress is the address of staked contract in concern 
     * @param _stakedContractIndex is the staked contract index in concern
     * @return amount of unlockable tokens
     */
    function _deprecated_getStakerUnlockableTokensOnSmartContract (
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakedContractIndex
    ) 
        public
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
        (, currentStakedTokens) = _deprecated_unlockableBeforeBurningAndCanBurn(_stakerAddress,
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
    function _deprecated_getStakerLockedTokensOnSmartContract (
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
    function _deprecated_calculateStakedTokens(
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
        } else {
            amount = 0;
        }
    }

    /**
     * @dev Gets the total staked NXM tokens against Smart contract 
     * by all stakers
     * @param _stakedContractAddress smart contract address.
     * @return amount total staked NXM tokens.
     */
    function _deprecated_burnStakerTokenLockedAgainstSmartContract(
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
