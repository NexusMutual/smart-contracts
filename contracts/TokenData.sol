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
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract TokenData is Iupgradable {
    using SafeMaths for uint;

    uint public lockTokenTimeAfterCoverExp;
    uint public bookTime;
    uint public lockCADays;
    uint public lockMVDays;
    uint public scValidDays;
    uint public joiningFee;
    address public walletAddress;

    struct StakeCommission {
        uint commissionEarned;
        uint commissionRedeemed;
    }

    struct Stake {
        address stakedContractAddress;
        uint dateAdd;
        uint stakeAmount;
        uint unlockedAmount;
    }

    struct CoverNote {
        bool isDeposited;
        uint toBurn;
    }

    struct BookedTokens {
        uint amount;
        uint validUntil;
    }

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    // mapping of uw address to array of sc address to fetch all staked contract address of underwriter
    // pushing data into this mapped array returns stakerIndex which is stored 
    // in another mapping smartContractStakerIndex
    mapping(address => Stake[]) public stakerStakedContracts; 

    //mapping of sc address to array of UW address to fetch all underwritters of the staked smart contract
    // pushing data into this mapped array returns scIndex which is stored in Stake struct 
    // i.e pushed in stakerStakedContracts mapping
    mapping(address => address[]) public stakedContractStakers;

    //mapping of staker Address to staked contract address to array that holds stakerIndex 
    mapping(address => mapping(address => uint[])) public stakerIndex;

    //mapping of staked contract address to staker Address to array that holds stakedContractIndex 
    mapping(address => mapping(address => uint[])) public stakedContractIndex;

    // mapping of staked contract Address to the array of StakeCommission
    // here index of this array is stakedContractIndex
    mapping(address => mapping(uint => StakeCommission)) public stakedContractStakeCommission;

    mapping(address => uint) public lastCompletedStakeCommission;

    // mapping of the staked contract address to the current staker index who will receive commission.
    mapping(address => uint) public stakedContractCurrentCommissionIndex;

    // mapping of the staked contract address to the current staker index to burn token from.
    mapping(address => uint) public stakedContractCurrentBurnIndex;

    // mapping to return true if Cover Note deposited against coverId
    // holds amount of covernote to be burned 
    mapping(uint => CoverNote) internal depositedCN;

    mapping(address => BookedTokens[]) internal bookedCA;

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
        onlyInternal         
        returns (address stakedContractAddress) 
    {
        stakedContractAddress = stakerStakedContracts[_stakerAddress][_stakerIndex].stakedContractAddress;
    }

    function getStakerStakedContractIndex(
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakerIndex
    ) 
        public
        view
        onlyInternal         
        returns (uint scIndex) 
    {
        scIndex = stakedContractIndex[_stakedContractAddress][_stakerAddress][_stakerIndex];
    }

    function getStakedContractStakerIndex(
        address _stakedContractAddress,
        address _stakerAddress,
        uint _stakedContractIndex
    ) 
        public
        view
        onlyInternal         
        returns (uint sIndex) 
    {
        sIndex = stakerIndex[_stakerAddress][_stakedContractAddress][_stakedContractIndex];
    }

    function getStakerInitialStakedAmountOnContract(
        address _stakerAddress,
        uint _stakerIndex
    )
        public 
        view
        onlyInternal
        returns (uint amount)
    {
        amount = stakerStakedContracts[_stakerAddress][_stakerIndex].stakeAmount;
    }

    function getStakerStakedContractLength(
        address _stakerAddress
    ) 
        public
        view
        onlyInternal
        returns (uint length)
    {
        length = stakerStakedContracts[_stakerAddress].length;
    }

    /**
    * @dev pushes the commission earned by a staker.
    * @param _stakerAddress address of staker.
    * @param _stakedContractAddress address of smart contract.
    * @param _stakedContractIndex index of the staker to distribute commission.
    * @param _commissionAmount amount to be given as commission.
    */ 
    function pushStakeCommissions(
        address _stakerAddress,
        address _stakedContractAddress,
        uint _stakedContractIndex,
        uint _commissionAmount
    )   
        public
        onlyInternal
    {
        stakedContractStakeCommission[_stakedContractAddress][_stakedContractIndex].commissionEarned = _commissionAmount;
            // commissionEarned = _commissionAmount;
        emit Commission(
            _stakerAddress,
            _stakedContractAddress,
            _stakedContractIndex,
            _commissionAmount
        );
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
    * @dev set flag for deposited covernote against a coverId
    *      Adds amount of covernote to burn
    * @param coverId coverId of Cover
    * @param flag true/false if deposited/not deposited
    * @param burnAmount amount of covernote to burn
    */
    function setDepositCN(uint coverId, bool flag, uint burnAmount) public onlyInternal {
        depositedCN[coverId].isDeposited = flag;
        depositedCN[coverId].toBurn = burnAmount;
    }

    function getDepositCNDetails(uint coverId) public view onlyInternal returns (bool, uint) {
        return (depositedCN[coverId].isDeposited, depositedCN[coverId].toBurn);
    }

    function getStakedContractStakerByIndex(
        address _address,
        uint _index
    )
        public
        onlyInternal
        returns (address)
    {
        return stakedContractStakers[_address][_index];
    }
    
    function getStakedContractStakersLength(
        address _stakedContractAddress
    ) 
        public
        onlyInternal
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
        scIndex = (stakedContractStakers[_stakedContractAddress].push(_stakerAddress)).sub(1);
        stakedContractIndex[_stakedContractAddress][_stakerAddress].push(scIndex);
        uint sIndex = (stakerStakedContracts[_stakerAddress].push(
            Stake(_stakedContractAddress, now, _amount, 0))).sub(1);
        stakerIndex[_stakerAddress][_stakedContractAddress].push(sIndex);
    }

    /**
    * @dev books the user's tokens for maintaining Assessor Velocity, i.e.
    *      once a token is used to cast a vote as a Claims assessor,
    *      the same token cannot be used to cast another vote before a fixed period of time(in milliseconds)
    * @param _of user's address.
    * @param value number of tokens that will be locked for a period of time.
    */
    function pushBookedCA(address _of, uint value) public onlyInternal {
        bookedCA[_of].push(BookedTokens(value, now.add(bookTime)));
    }

    /**
    * @dev Calculates the sum of tokens booked by a user for Claims Assessment.
    */ 
    function getBookedCA(address _to) public view onlyInternal returns(uint tokensBookedCA) {
        tokensBookedCA = 0;
        for (uint i = 0; i < bookedCA[_to].length; i++) {
            if (now < bookedCA[_to][i].validUntil)
                tokensBookedCA = tokensBookedCA.add(bookedCA[_to][i].amount);
        }
    }

    /**
    * @dev Changes the time period up to which tokens will be locked.
    *      Used to generate the validity period of tokens booked by
    *      a user for participating in claim's assessment/claim's voting.
    */ 
    function changeBookTime(uint _time) public onlyOwner {
        bookTime = _time;
    }

    /**
    * @dev Changes lock CA days - number of days for which tokens are locked while submitting a vote.
    */ 
    function changelockCADays(uint _val) public onlyInternal {
        lockCADays = _val;
    }
    
    /**
    * @dev Changes lock MV days - number of days for which tokens are locked while submitting a vote.
    */ 
    function changelockMVDays(uint _val) public onlyInternal {
        lockMVDays = _val;
    }

    /**
    * @dev Changes number of days for which NXM needs to staked in case of underwriting
    */ 
    function changeSCValidDays(uint _days) public onlyOwner {
        scValidDays = _days;
    }

    /**
    * @dev Sets the index which will receive commission.
    * @param _stakedContractAddress smart contract address.
    * @param _index current index.
    */
    function setStakedContractCurrentCommissionIndex(address _stakedContractAddress, uint _index) public onlyInternal {
        stakedContractCurrentCommissionIndex[_stakedContractAddress] = _index;
    }

    /**
    * @dev Sets the index till which commission is distrubuted.
    * @param _stakedContractAddress smart contract address.
    * @param _index current index.
    */
    function setStakedContractCurrentBurnIndex(address _stakedContractAddress, uint _index) public onlyInternal {
        stakedContractCurrentBurnIndex[_stakedContractAddress] = _index;
    }

    /**
    * @dev Changes extra lock period for a cover, post its expiry.
    */ 
    function setLockTokenTimeAfterCoverExp(uint time) public onlyInternal {
        lockTokenTimeAfterCoverExp = time;
    }

    /**
    * @dev Change the wallet address which receive Joining Fee
    */
    function changeWalletAddress(address _address) public onlyOwner {
        walletAddress = _address;
    }

    /**
    * @dev Set the joining fee for membership
    */
    function setJoiningFee(uint _amount) public onlyOwner {
        joiningFee = _amount;
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
        returns (uint amount) 
    {
        uint _stakedContractIndex;
        address _stakedContractAddress;
        _stakedContractAddress = stakerStakedContracts[_stakerAddress][_stakerIndex].stakedContractAddress;
        _stakedContractIndex = stakedContractIndex[_stakedContractAddress][_stakerAddress][_stakerIndex];
        amount = stakedContractStakeCommission[_stakedContractAddress][_stakedContractIndex].commissionEarned;
    }

    /**
    * @dev Internal function to get stake commission given to an 
    * underwriter for particular stakedcontract on given index.
    * @param _stakerAddress address of staker.
    * @param _stakerIndex index of the staker commission.
    */ 
    function _getStakerRedeemedStakeCommission(
        address _stakerAddress,
        uint _stakerIndex
    )
        internal 
        returns (uint amount) 
    {
        uint _stakedContractIndex;
        address _stakedContractAddress;
        _stakedContractAddress = stakerStakedContracts[_stakerAddress][_stakerIndex].stakedContractAddress;
        _stakedContractIndex = stakedContractIndex[_stakedContractAddress][_stakerAddress][_stakerIndex];
        amount = stakedContractStakeCommission[_stakedContractAddress][_stakedContractIndex].commissionRedeemed;
    }
}