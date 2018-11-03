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
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract TokenData is Iupgradable {
    using SafeMaths for uint;

    NXMaster public ms; 
    uint public lockTokenTimeAfterCoverExp;
    uint public bookTime;
    uint public lockCADays;
    uint public lockMVDays;
    uint public scValidDays;
    uint public joiningFee;
    address public walletAddress;

    struct StakeCommission {
        uint commissionAmt;
        uint commissionDate;
        bool claimed;
    }

    struct Stake {
        address scAddress;
        uint scIndex;
        uint amount;
        uint dateAdd;
        uint unlocked;
    }

    struct CoverNote {
        bool isDeposited;
        uint toBurn;
    }

    struct LockToken {
        uint validUpto;
        uint amount;
    }

    modifier onlyInternal {
        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    // mapping of uw address to array of sc address to fetch all staked contract address of underwriter
    mapping(address => Stake[]) public stakerStakedContracts; 

    //mapping of sc address to array of UW address to fetch all underwritters of the staked smart contract
    mapping(address => address[]) public smartContractStakers;

    // mapping of staker address to staked contract address to the index of 
    // that staked contract to details of commission
    mapping(address => mapping(address => mapping(uint => StakeCommission[]))) public stakerSCIndexCommission;

    // mapping of the staked contract address to the current staker index who will receive commission.
    mapping(address => uint) public scAddressCurrentCommissionIndex;

    // mapping of the staked contract address to the current staker index to burn token from.
    mapping(address => uint) public scAddressCurrentBurnIndex;

    mapping(address => mapping (address => mapping(uint => uint))) public lastClaimedCommission;

    // mapping to return true if Cover Note deposited against coverId
    mapping(uint => CoverNote) internal depositedCN;

    mapping(address => LockToken[]) internal bookedCA;

    constructor() public {
        bookTime = 12 hours;
        joiningFee = 2000000000000000; // 0.002 Ether
        lockTokenTimeAfterCoverExp = 35 days;
        scValidDays = 250;
        lockCADays = 7 days;
        lockMVDays = 2 days;
    }
    
    function getStakerStakedContractByIndex(address _stakerAddress, uint _index) 
        public
        view
        onlyInternal         
        returns (address addr) 
    {
        addr = stakerStakedContracts[_stakerAddress][_index].scAddress;
    }

    function getStakerStakedContractIndexByIndex(address _stakerAddress, uint _index) 
        public
        view
        onlyInternal         
        returns (uint scIndex) 
    {
        scIndex = stakerStakedContracts[_stakerAddress][_index].scIndex;
    }

    function getStakerInitialStakedAmountOnContract(address _stakerAddress, uint _index)
        public 
        view
        onlyInternal
        returns (uint amount)
    {
        amount = stakerStakedContracts[_stakerAddress][_index].amount;
    }

    function getStakerStakedContractLength(address _stakerAddress) public view onlyInternal returns (uint length) {
        length = stakerStakedContracts[_stakerAddress].length;
    }

    /**
    * @dev Gets length of stake commission.
    * @param _of address of staker.
    * @param _scAddress smart contract address.
    * @param _stakerIndx index of the staker commission.
    * @return _length length.
    */ 
    function getStakeCommissionLength(
        address _of,
        address _scAddress,
        uint _stakerIndx
    )   
        public 
        view
        returns(uint length)
    {
        length = stakerSCIndexCommission[_of][_scAddress][_stakerIndx].length;
    }

    function getLastClaimedCommission(address _of, address _sc, uint _index) public view returns(uint) {
        return lastClaimedCommission[_of][_sc][_index];
    }

    /**
    * @dev pushes the commission earned by a staker.
    * @param _of address of staker.
    * @param _scAddress address of smart contract.
    * @param _stakerIndx index of the staker to distribute commission.
    * @param _commissionAmt amount to be given as commission.
    * @param _commissionDate date when commission is given.
    */ 
    function pushStakeCommissions(
        address _of,
        address _scAddress,
        uint _stakerIndx,
        uint _commissionAmt,
        uint _commissionDate
    )   
        public
        onlyInternal
    {
        stakerSCIndexCommission[_of][_scAddress][_stakerIndx].push(
            StakeCommission(_commissionAmt, _commissionDate, false));
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

    function getSmartContractStakerByIndex(address _address, uint _index) public onlyInternal returns (address) {
        return smartContractStakers[_address][_index];
    }
    
    function getSmartContractStakerLength(address _scAddress) public onlyInternal returns (uint length) {
        length = smartContractStakers[_scAddress].length;
    } 

    /**
    * @dev Adds a new stake record.
    * @param _of staker address.
    * @param _scAddress smart contract address.
    * @param _amount amountof NXM to be staked.
    */
    function addStake(address _of, address _scAddress, uint _amount) public onlyInternal returns(uint index) {
        index = (smartContractStakers[_scAddress].push(_of)).sub(1);
        stakerStakedContracts[_of].push(Stake(_scAddress, index, _amount, now, 0));
    }

    /**
    * @dev books the user's tokens for maintaining Assessor Velocity, i.e.
    *      once a token is used to cast a vote as a Claims assessor,
    *      the same token cannot be used to cast another vote before a fixed period of time(in milliseconds)
    * @param _of user's address.
    * @param value number of tokens that will be locked for a period of time.
    */
    function pushBookedCA(address _of, uint value) public onlyInternal {
        bookedCA[_of].push(LockToken(now.add(bookTime), value));
    }

    /**
    * @dev Calculates the sum of tokens booked by a user for Claims Assessment.
    */ 
    function getBookedCA(address _to) public view onlyInternal returns(uint tokensBookedCA) {
        tokensBookedCA = 0;
        for (uint i = 0; i < bookedCA[_to].length; i++) {
            if (now < bookedCA[_to][i].validUpto)
                tokensBookedCA = SafeMaths.add(tokensBookedCA, bookedCA[_to][i].amount);
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
        lockMVDays = _val;
    }

    /**
    * @dev Changes number of days for which NXM needs to staked in case of underwriting
    */ 
    function changeSCValidDays(uint _days) public onlyOwner {
        scValidDays = _days;
    }

    /**
    * @dev Sets the index till which commission is distrubuted.
    * @param _scAddress smart contract address.
    * @param _index last index.
    */
    function setscAddressCurrentCommissionIndex(address _scAddress, uint _index) public onlyInternal {
        scAddressCurrentCommissionIndex[_scAddress] = _index;
    }

    /**
    * @dev Sets the index till which commission is distrubuted.
    * @param _scAddress smart contract address.
    * @param _index last index.
    */
    function setscAddressCurrentBurnIndex(address _scAddress, uint _index) public onlyInternal {
        scAddressCurrentBurnIndex[_scAddress] = _index;
    }

    /**
    * @dev Changes extra lock period for a cover, post its expiry.
    */ 
    function setLockTokenTimeAfterCoverExp(uint time) public onlyInternal {
        lockTokenTimeAfterCoverExp = time;
    }

    function setClaimedCommision(address _of, address _scAddress, uint _stakerIndx, uint _index) public onlyInternal {
        stakerSCIndexCommission[_of][_scAddress][_stakerIndx][_index].claimed = true;
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

    function setLastClaimedCommission(
        address _of,
        address _sc,
        uint _index,
        uint lastClaimed
    )
        public
        onlyInternal
    {
        lastClaimedCommission[_of][_sc][_index] = lastClaimed;
    }
}
