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

import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";


contract TokenData is Iupgradable {
    using SafeMath for uint;

    address public walletAddress;
    uint public lockTokenTimeAfterCoverExp;
    uint public bookTime;
    uint public lockCADays;
    uint public lockMVDays;
    uint public scValidDays;
    uint public joiningFee;
    uint public stakerCommissionPer;
    uint public stakerMaxCommissionPer;
    uint public tokenExponent;
    uint public priceStep;

    struct StakeCommission {
        uint commissionEarned;
        uint commissionRedeemed;
    }

    struct Stake {
        address stakedContractAddress;
        uint stakedContractIndex;
        uint dateAdd;
        uint stakeAmount;
        uint unlockedAmount;
        uint burnedAmount;
        uint unLockableBeforeLastBurn;
    }

    struct Staker {
        address stakerAddress;
        uint stakerIndex;
    }

    struct CoverNote {
        uint amount;
        bool isDeposited;
    }

    /**
     * @dev mapping of uw address to array of sc address to fetch 
     * all staked contract address of underwriter, pushing
     * data into this array of Stake returns stakerIndex 
     */ 
    mapping(address => Stake[]) public stakerStakedContracts; 

    /** 
     * @dev mapping of sc address to array of UW address to fetch
     * all underwritters of the staked smart contract
     * pushing data into this mapped array returns scIndex 
     */
    mapping(address => Staker[]) public stakedContractStakers;

    /**
     * @dev mapping of staked contract Address to the array of StakeCommission
     * here index of this array is stakedContractIndex
     */ 
    mapping(address => mapping(uint => StakeCommission)) public stakedContractStakeCommission;

    mapping(address => uint) public lastCompletedStakeCommission;

    /** 
     * @dev mapping of the staked contract address to the current 
     * staker index who will receive commission.
     */ 
    mapping(address => uint) public stakedContractCurrentCommissionIndex;

    /** 
     * @dev mapping of the staked contract address to the 
     * current staker index to burn token from.
     */ 
    mapping(address => uint) public stakedContractCurrentBurnIndex;

    /** 
     * @dev mapping to return true if Cover Note deposited against coverId
     */ 
    mapping(uint => CoverNote) public depositedCN;

    mapping(address => uint) internal isBookedTokens;

    event Commission(
        address indexed stakedContractAddress,
        address indexed stakerAddress,
        uint indexed scIndex,
        uint commissionAmount
    );

    constructor() public {
        bookTime = 12 hours;
        joiningFee = 2000000000000000; // 0.002 Ether
        lockTokenTimeAfterCoverExp = 35 days;
        scValidDays = 250;
        lockCADays = 7 days;
        lockMVDays = 2 days;
        stakerCommissionPer = 20;
        stakerMaxCommissionPer = 50;
        tokenExponent = 4;
        priceStep = 1000;

    }

    /**
    * @dev Just for interface
    */
    function changeDependentContractAddress() public { //solhint-disable-line
    }
    
    function getStakerStakedContractByIndex(
        address _stakerAddress,
        uint _stakerIndex
    ) 
        public
        view
        returns (address stakedContractAddress) 
    {
        stakedContractAddress = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakedContractAddress;
    }

    function getStakerStakedBurnedByIndex(
        address _stakerAddress,
        uint _stakerIndex
    ) 
        public
        view
        returns (uint burnedAmount) 
    {
        burnedAmount = stakerStakedContracts[
            _stakerAddress][_stakerIndex].burnedAmount;
    }

    function getStakerStakedUnlockableBeforeLastBurnByIndex(
        address _stakerAddress,
        uint _stakerIndex
    ) 
        public
        view
        returns (uint unlockable) 
    {
        unlockable = stakerStakedContracts[
            _stakerAddress][_stakerIndex].unLockableBeforeLastBurn;
    }

    function getStakerStakedContractIndex(
        address _stakerAddress,
        uint _stakerIndex
    ) 
        public
        view
        returns (uint scIndex) 
    {
        scIndex = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakedContractIndex;
    }

    function getStakedContractStakerIndex(
        address _stakedContractAddress,
        uint _stakedContractIndex
    ) 
        public
        view
        returns (uint sIndex) 
    {
        sIndex = stakedContractStakers[
            _stakedContractAddress][_stakedContractIndex].stakerIndex;
    }

    function getStakerInitialStakedAmountOnContract(
        address _stakerAddress,
        uint _stakerIndex
    )
        public 
        view
        returns (uint amount)
    {
        amount = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakeAmount;
    }

    function getStakerStakedContractLength(
        address _stakerAddress
    ) 
        public
        view
        returns (uint length)
    {
        length = stakerStakedContracts[_stakerAddress].length;
    }

    function getStakerUnlockedStakedTokens(
        address _stakerAddress,
        uint _stakerIndex
    )
        public 
        view
        returns (uint amount)
    {
        amount = stakerStakedContracts[
            _stakerAddress][_stakerIndex].unlockedAmount;
    }

    /**
     * @dev pushes the unlocked staked tokens by a staker.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker to distribute commission.
     * @param _amount amount to be given as commission.
     */ 
    function pushUnlockedStakedTokens(
        address _stakerAddress,
        uint _stakerIndex,
        uint _amount
    )   
        public
        onlyInternal
    {   
        stakerStakedContracts[_stakerAddress][
            _stakerIndex].unlockedAmount = stakerStakedContracts[_stakerAddress][
                _stakerIndex].unlockedAmount.add(_amount);
    }

    /**
     * @dev pushes the Burned tokens for a staker.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker.
     * @param _amount amount to be burned.
     */ 
    function pushBurnedTokens(
        address _stakerAddress,
        uint _stakerIndex,
        uint _amount
    )   
        public
        onlyInternal
    {   
        stakerStakedContracts[_stakerAddress][
            _stakerIndex].burnedAmount = stakerStakedContracts[_stakerAddress][
                _stakerIndex].burnedAmount.add(_amount);
    }

    /**
     * @dev pushes the unLockable tokens for a staker before last burn.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker.
     * @param _amount amount to be added to unlockable.
     */ 
    function pushUnlockableBeforeLastBurnTokens(
        address _stakerAddress,
        uint _stakerIndex,
        uint _amount
    )   
        public
        onlyInternal
    {   
        stakerStakedContracts[_stakerAddress][
            _stakerIndex].unLockableBeforeLastBurn = stakerStakedContracts[_stakerAddress][
                _stakerIndex].unLockableBeforeLastBurn.add(_amount);
    }

    /**
     * @dev sets the unLockable tokens for a staker before last burn.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker.
     * @param _amount amount to be added to unlockable.
     */ 
    function setUnlockableBeforeLastBurnTokens(
        address _stakerAddress,
        uint _stakerIndex,
        uint _amount
    )   
        public
        onlyInternal
    {   
        stakerStakedContracts[_stakerAddress][
            _stakerIndex].unLockableBeforeLastBurn = _amount;
    }

    /**
     * @dev pushes the earned commission earned by a staker.
     * @param _stakerAddress address of staker.
     * @param _stakedContractAddress address of smart contract.
     * @param _stakedContractIndex index of the staker to distribute commission.
     * @param _commissionAmount amount to be given as commission.
     */ 
    function pushEarnedStakeCommissions(
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakedContractIndex,
        uint _commissionAmount
    )   
        public
        onlyInternal
    {
        stakedContractStakeCommission[_stakedContractAddress][_stakedContractIndex].
            commissionEarned = stakedContractStakeCommission[_stakedContractAddress][
                _stakedContractIndex].commissionEarned.add(_commissionAmount);
                
        emit Commission(
            _stakerAddress,
            _stakedContractAddress,
            _stakedContractIndex,
            _commissionAmount
        );
    }

    /**
     * @dev pushes the redeemed commission redeemed by a staker.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker to distribute commission.
     * @param _amount amount to be given as commission.
     */ 
    function pushRedeemedStakeCommissions(
        address _stakerAddress,
        uint _stakerIndex,
        uint _amount
    )   
        public
        onlyInternal
    {   
        uint stakedContractIndex = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakedContractIndex;
        address stakedContractAddress = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakedContractAddress;
        stakedContractStakeCommission[stakedContractAddress][stakedContractIndex].
            commissionRedeemed = stakedContractStakeCommission[
                stakedContractAddress][stakedContractIndex].commissionRedeemed.add(_amount);
    }

    /**
     * @dev Gets stake commission given to an underwriter
     * for particular stakedcontract on given index.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker commission.
     */ 
    function getStakerEarnedStakeCommission(
        address _stakerAddress,
        uint _stakerIndex
    )
        public 
        view
        returns (uint) 
    {
        return _getStakerEarnedStakeCommission(_stakerAddress, _stakerIndex);
    }

    /**
     * @dev Gets stake commission redeemed by an underwriter
     * for particular staked contract on given index.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker commission.
     * @return commissionEarned total amount given to staker.
     */ 
    function getStakerRedeemedStakeCommission(
        address _stakerAddress,
        uint _stakerIndex
    )
        public 
        view
        returns (uint) 
    {
        return _getStakerRedeemedStakeCommission(_stakerAddress, _stakerIndex);
    }

    /**
     * @dev Gets total stake commission given to an underwriter
     * @param _stakerAddress address of staker.
     * @return totalCommissionEarned total commission earned by staker.
     */ 
    function getStakerTotalEarnedStakeCommission(
        address _stakerAddress
    )
        public 
        view
        returns (uint totalCommissionEarned) 
    {
        totalCommissionEarned = 0;
        for (uint i = 0; i < stakerStakedContracts[_stakerAddress].length; i++) {
            totalCommissionEarned = totalCommissionEarned.
                add(_getStakerEarnedStakeCommission(_stakerAddress, i));
        }
    }

    /**
     * @dev Gets total stake commission given to an underwriter
     * @param _stakerAddress address of staker.
     * @return totalCommissionEarned total commission earned by staker.
     */ 
    function getStakerTotalReedmedStakeCommission(
        address _stakerAddress
    )
        public 
        view
        returns(uint totalCommissionRedeemed) 
    {
        totalCommissionRedeemed = 0;
        for (uint i = 0; i < stakerStakedContracts[_stakerAddress].length; i++) {
            totalCommissionRedeemed = totalCommissionRedeemed.add(
                _getStakerRedeemedStakeCommission(_stakerAddress, i));
        }
    }

    /**
     * @dev set flag to deposit/ undeposit cover note 
     * against a cover Id
     * @param coverId coverId of Cover
     * @param flag true/false for deposit/undeposit
     */
    function setDepositCN(uint coverId, bool flag) public onlyInternal {

        if (flag == true) {
            require(!depositedCN[coverId].isDeposited, "Cover note already deposited");    
        }

        depositedCN[coverId].isDeposited = flag;
    }

    /**
     * @dev set locked cover note amount
     * against a cover Id
     * @param coverId coverId of Cover
     * @param amount amount of nxm to be locked
     */
    function setDepositCNAmount(uint coverId, uint amount) public onlyInternal {

        depositedCN[coverId].amount = amount;
    }

    function getStakedContractStakerByIndex(
        address _stakedContractAddress,
        uint _stakedContractIndex
    )
        public
        view
        returns (address stakerAddress)
    {
        stakerAddress = stakedContractStakers[
            _stakedContractAddress][_stakedContractIndex].stakerAddress;
    }

    function getStakedContractStakersLength(
        address _stakedContractAddress
    ) 
        public
        view
        returns (uint length)
    {
        length = stakedContractStakers[_stakedContractAddress].length;
    } 
    
    /**
     * @dev Adds a new stake record.
     * @param _stakerAddress staker address.
     * @param _stakedContractAddress smart contract address.
     * @param _amount amountof NXM to be staked.
     */
    function addStake(
        address _stakerAddress,
        address _stakedContractAddress,
        uint _amount
    ) 
        public
        onlyInternal
        returns(uint scIndex) 
    {
        scIndex = (stakedContractStakers[_stakedContractAddress].push(
            Staker(_stakerAddress, stakerStakedContracts[_stakerAddress].length))).sub(1);
        stakerStakedContracts[_stakerAddress].push(
            Stake(_stakedContractAddress, scIndex, now, _amount, 0, 0, 0));
    }

    /**
     * @dev books the user's tokens for maintaining Assessor Velocity, 
     * i.e. once a token is used to cast a vote as a Claims assessor,
     * @param _of user's address.
     */
    function bookCATokens(address _of) public onlyInternal {
        require(!isCATokensBooked(_of), "Tokens already booked");
        isBookedTokens[_of] = now.add(bookTime);
    }

    function isCATokensBooked(address _of) public view returns(bool res) {
        if (now < isBookedTokens[_of])
            res = true;
    }

    /**
     * @dev Sets the index which will receive commission.
     * @param _stakedContractAddress smart contract address.
     * @param _index current index.
     */
    function setStakedContractCurrentCommissionIndex(
        address _stakedContractAddress,
        uint _index
    )
        public
        onlyInternal
    {
        stakedContractCurrentCommissionIndex[_stakedContractAddress] = _index;
    }

    /**
     * @dev Sets the last complete commission index
     * @param _stakerAddress smart contract address.
     * @param _index current index.
     */
    function setLastCompletedStakeCommissionIndex(
        address _stakerAddress,
        uint _index
    )
        public
        onlyInternal
    {
        lastCompletedStakeCommission[_stakerAddress] = _index;
    }

    /**
     * @dev Sets the index till which commission is distrubuted.
     * @param _stakedContractAddress smart contract address.
     * @param _index current index.
     */
    function setStakedContractCurrentBurnIndex(
        address _stakedContractAddress,
        uint _index
    )
        public
        onlyInternal
    {
        stakedContractCurrentBurnIndex[_stakedContractAddress] = _index;
    }

    function updateUintParameters(bytes8 code, uint val) public {
      require(ms.checkIsAuthToGoverned(msg.sender));
      if(code == "TOKEXP"){

        _setTokenExponent(val); 

      } else if(code == "TOKSTEP"){

        _setPriceStep(val);

      } else if(code == "RALOCKT"){

        _changeSCValidDays(val);

      } else if(code == "RACOMM"){

        _setStakerCommissionPer(val);

      } else if(code == "RAMAXC"){

        _setStakerMaxCommissionPer(val);

      } else if(code == "CABOOKT"){

        _changeBookTime(val);

        } else if(code == "CALOCKT"){

        _changelockCADays(val);

        } else if(code == "MVLOCKT"){

        _changelockMVDays(val);

        } else if(code == "QUOLOCKT"){

            _setLockTokenTimeAfterCoverExp(val);

        } else if(code == "JOINFEE"){

            _setJoiningFee(val);

        } 
    }

    function updateOwnerParameters(bytes8 code, address val) public {

        require(ms.checkIsAuthToGoverned(msg.sender));
        if(code == "MSWALLET"){

            _changeWalletAddress(val);

        }
        
    }

    /**
     * @dev Internal function to get stake commission given to an 
     * underwriter for particular stakedcontract on given index.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker commission.
     */ 
    function _getStakerEarnedStakeCommission(
        address _stakerAddress,
        uint _stakerIndex
    )
        internal
        view 
        returns (uint amount) 
    {
        uint _stakedContractIndex;
        address _stakedContractAddress;
        _stakedContractAddress = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakedContractAddress;
        _stakedContractIndex = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakedContractIndex;
        amount = stakedContractStakeCommission[
            _stakedContractAddress][_stakedContractIndex].commissionEarned;
    }

    /**
     * @dev Internal function to get stake commission redeemed by an 
     * underwriter for particular stakedcontract on given index.
     * @param _stakerAddress address of staker.
     * @param _stakerIndex index of the staker commission.
     */ 
    function _getStakerRedeemedStakeCommission(
        address _stakerAddress,
        uint _stakerIndex
    )
        internal
        view 
        returns (uint amount) 
    {
        uint _stakedContractIndex;
        address _stakedContractAddress;
        _stakedContractAddress = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakedContractAddress;
        _stakedContractIndex = stakerStakedContracts[
            _stakerAddress][_stakerIndex].stakedContractIndex;
        amount = stakedContractStakeCommission[
            _stakedContractAddress][_stakedContractIndex].commissionRedeemed;
    }

    function _setStakerCommissionPer(uint _val) internal {
        stakerCommissionPer = _val;
    }

    function _setStakerMaxCommissionPer(uint _val) internal {
        stakerMaxCommissionPer = _val;
    }

    function _setTokenExponent(uint _val) internal {
        tokenExponent = _val;
    }

    function _setPriceStep(uint _val) internal {
        priceStep = _val;
    }

    /**
     * @dev Changes number of days for which NXM needs to staked in case of underwriting
     */ 
    function _changeSCValidDays(uint _days) internal {
        scValidDays = _days;
    }

    /**
     * @dev Changes the time period up to which tokens will be locked.
     *      Used to generate the validity period of tokens booked by
     *      a user for participating in claim's assessment/claim's voting.
     */ 
    function _changeBookTime(uint _time) internal {
        bookTime = _time;
    }

    /**
     * @dev Changes lock CA days - number of days for which tokens 
     * are locked while submitting a vote.
     */ 
    function _changelockCADays(uint _val) internal {
        lockCADays = _val;
    }
    
    /**
     * @dev Changes lock MV days - number of days for which tokens are locked
     * while submitting a vote.
     */ 
    function _changelockMVDays(uint _val) internal {
        lockMVDays = _val;
    }

    /**
     * @dev Changes extra lock period for a cover, post its expiry.
     */ 
    function _setLockTokenTimeAfterCoverExp(uint time) internal {
        lockTokenTimeAfterCoverExp = time;
    }

    /**
     * @dev Set the joining fee for membership
     */
    function _setJoiningFee(uint _amount) internal {
        joiningFee = _amount;
    }

    /**
     * @dev Change the wallet address which receive Joining Fee
     */
    function _changeWalletAddress(address _address) internal {
        walletAddress = _address;
    }
}