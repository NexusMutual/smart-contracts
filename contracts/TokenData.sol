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
}
