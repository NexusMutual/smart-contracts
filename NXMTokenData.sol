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


pragma solidity ^0.4.8;
import "./master.sol";
contract NXMTokenData {

    master ms1;
    address masterAddress;
    string public version = 'NXM 0.1';
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    address owner;
    uint  initialTokens;
    uint public  currentFounderTokens;
    uint public memberCounter;
    uint  bookTime;
    uint  minVoteLockPeriod;
    struct lockToken
    {
        uint validUpto;
        uint amount;
    }
    struct SDidAndTime{
        uint totalAmount;
        uint time_done;
        uint blockNumber;
        uint totalDistTillNow;
    }
    struct incentive{
        uint amount;
        uint success;
    }
    struct allocatedTokens{
        address memberAdd;
        uint tokens;
        uint date_add;
        uint blockNumber;
    }

    allocatedTokens[] allocatedFounderTokens;
  

    mapping (address => uint256) public balanceOf;
    mapping (address => mapping(uint=>lockToken[])) public depositCN_Cover;
    mapping (address => lockToken[])   lockedCA;
    mapping (address => lockToken[])  lockedSD;
    mapping (address => lockToken[])  lockedCN;
    mapping (address => lockToken[])  bookedCA;
    mapping (address => mapping(uint => lockToken)) public lockedCN_Cover;
    mapping (address => mapping (address => uint256)) public allowance;
    mapping (bytes16 => uint) public currency_token; 
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);
    event Burn(address indexed _of,bytes16 eventName , uint coverId ,uint tokens);
    mapping (address => mapping (uint => lockToken[])) public burnCAToken; 
    mapping (bytes16 => uint) public poolFundValue;
    address[] public allMembers;
    mapping (address => uint) isInallMembers; 
    SDidAndTime[] SDHistory;
    mapping(uint=>mapping(address=>incentive)) SDMemberPayHistory;    
    uint lastSDDate;
    uint sdDistTime;
    
    function NXMTokenDataCon(
    uint256 initialSupply,
    string tokenName,
    uint8 decimalUnits,
    string tokenSymbol
    ) {
        owner = msg.sender;
        initialTokens = 1500000;
        balanceOf[msg.sender] = initialSupply;              // Give the creator all initial tokens
        totalSupply = initialSupply;                        // Update total supply
        name = tokenName;                                   // Set the name for display purposes
        symbol = tokenSymbol;                               // Set the symbol for display purposes
        decimals = decimalUnits;
       
        bookTime = 12*60*60;
        minVoteLockPeriod = 7 * 1 days;     
        sdDistTime = 7 * 1 days;                
    }
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000)
            masterAddress = _add;
        else
        {
            ms1=master(masterAddress);
            if(ms1.isInternal(msg.sender) == 1)
                masterAddress = _add;
            else
                throw;
        }
    }
    modifier onlyInternal {
        ms1=master(masterAddress);
        require(ms1.isInternal(msg.sender) == 1);
        _; 
    }
    modifier onlyOwner{
        ms1=master(masterAddress);
        require(ms1.isOwner(msg.sender) == 1);
        _; 
    }
    function addInSDMemberPayHistory(uint index ,address _add,uint weight ,uint done) onlyInternal
    {
        SDMemberPayHistory[index][_add] = incentive(weight,done);
    }
    function confirmSDDistribution(uint index,address _add) onlyInternal
    {
        SDMemberPayHistory[index][_add].success = 1;
    }
    function getSDDistributionIndWeight(uint index, address _add) constant returns(uint weigh)
    {
        weigh =SDMemberPayHistory[index][_add].amount;
    }
    function getsdDistributionTime() constant returns(uint _time)
    {
        _time = sdDistTime;
    }
    function pushInSDHistory(uint value , uint _time, uint blockno ,uint total) onlyInternal
    {
        SDHistory.push(SDidAndTime(value,_time,blockno,total));
    }
    function setSDDistributionTime(uint _time) onlyOwner
    {
        sdDistTime = _time;
    }
    function getSDLength() constant returns(uint len)
    {
        len = SDHistory.length;
    }
    function getSDDistDetailById(uint id) constant returns(uint index , uint amount, uint date , uint totalAmount)
    {
        index = id;
        amount = SDHistory[id].totalAmount;
        date = SDHistory[id].time_done;
        totalAmount = SDHistory[id].totalDistTillNow;
    }
    function getTotalSDTillNow()constant returns(uint tot)
    {
        tot = SDHistory[SDHistory.length -1].totalDistTillNow;
    }
    function getLastDistributionTime() constant returns(uint datedone)
    {
        datedone = SDHistory[SDHistory.length -1].time_done;
    }

    function getCurrentFounderTokens() constant returns(uint tokens) 
    {
        tokens = currentFounderTokens;
    }
    function getMinVoteLockPeriod() constant returns(uint period)
    {
        period = minVoteLockPeriod;
    }
    function changeMinVoteLockPeriod(uint period) onlyOwner
    {
        minVoteLockPeriod = period;
    } 
    function changeCurrentFounderTokens(uint tokens) onlyInternal 
    {
        currentFounderTokens = tokens;
    }
    function changeIntialTokens(uint initTokens) onlyOwner
    {
        if(initTokens>currentFounderTokens)
            initialTokens=initTokens;

    }
    function addInAllocatedFounderTokens(address _to ,uint  tokens) onlyInternal
    {
        allocatedFounderTokens.push(allocatedTokens(_to , tokens , now , block.number));
    }
    function changeBookTime(uint _time) onlyOwner
    {
        bookTime = _time;
    }
    function getBookTime() constant returns(uint _time)
    {
        _time = bookTime;
    }
    function getBalanceOf(address _add)constant returns(uint bal) 
    {
        bal = balanceOf[_add];
    }
    function changeBalanceOf(address _of , uint tokens)  onlyInternal
    {
        balanceOf[_of] = tokens;
    }
    function getTotalSupply()constant returns (uint ts)
    {
        ts = totalSupply;
    }
    function changeTotalSupply(uint tokens) onlyInternal
    {
        totalSupply = tokens;
    }
    function setAllowance(address a1,address a2,uint value) onlyInternal
    {
        allowance[a1][a2] = value;
    }
    function getAllowance(address a1 , address a2) constant returns(uint value)
    {
        value = allowance[a1][a2];
    }
    function getCurrencyTokens(bytes16 curr) constant returns(uint tokens)
    {
        tokens = currency_token[curr];
    }
    function changeCurrencyTokens(bytes16 curr , uint tokens) onlyInternal
    {
        currency_token[curr] = tokens;
    }
    function checkInallMemberArray(address _add) constant returns(uint check)
    {
        check = 0;
        if(isInallMembers[_add]==1)
            check=1;
    }
    function addInAllMemberArray(address _add) onlyInternal
    {
        isInallMembers[_add] = 1;
        allMembers.push(_add);
    }
    function incMemberCounter() onlyInternal
    {
        memberCounter++;
    }
    function decMemberCounter() onlyInternal
    {
        memberCounter--;
    }
    function getInitialFounderTokens() constant returns(uint tokens)
    {
        tokens = initialTokens;
    }
    function getAllMembersLength() constant returns(uint len)
    {
        len = allMembers.length;
    }
    function getMember_index(uint i) constant returns(address _add)
    {
        _add = allMembers[i];
    }
    function getPoolFundValue(bytes16 curr) constant returns(uint amount)
    {
        amount=poolFundValue[curr];
    }
    function changePoolFundValue(bytes16 curr , uint val) onlyInternal
    {
        poolFundValue[curr] = val;
    }
    function pushBookedCA(address _of ,uint timestamp , uint forTime , uint value) onlyInternal
    {
        bookedCA[_of].push(lockToken(timestamp + forTime , value));
    }
    function getLockCALength(address _of) constant returns (uint len)
    {
        len = lockedCA[_of].length;
    }
    function getLockCAWithIndex(address _of ,uint index) constant returns(uint valid , uint amt)
    {
        valid = lockedCA[_of][index].validUpto;
        amt = lockedCA[_of][index].amount;
    }
    function getLockedCALength(address _of) constant returns(uint len)
    {
        len = lockedCA[_of].length;
    }
    function getLockedCA_index(address _of , uint index) constant returns(uint valid ,uint val)
    {
        valid = lockedCA[_of][index].validUpto;
        val = lockedCA[_of][index].amount;
    }
    function changeLockedCA_Index(address _of , uint index , uint value) onlyInternal
    {
        lockedCA[_of][index].amount = value;
    }
    function extendCA(address _of , uint index , uint newTimestamp) onlyInternal
    {
        lockedCA[_of][index].validUpto = newTimestamp;
    }
    function getLockedCNLength(address _of) constant returns(uint len)
    {
        len = lockedCN[_of].length;
    }
    function getLockedCN_index(address _of , uint index) constant returns(uint valid ,uint val)
    {
        valid = lockedCN[_of][index].validUpto;
        val = lockedCN[_of][index].amount;
    }
    function updateLockedCN(address _of , uint index , uint timestamp , uint amount1) onlyInternal
    {
        lockedCN[_of][index].validUpto = timestamp;
        lockedCN[_of][index].amount = amount1;
    }
    function getLockedSDLength(address _of) constant returns(uint len)
    {
        len = lockedSD[_of].length;
    }
    function getLockedSD_index(address _of , uint index) constant returns(uint valid ,uint val)
    {
        valid = lockedSD[_of][index].validUpto;
        val = lockedSD[_of][index].amount;
    }
    function getBookedCALength(address _of) constant returns(uint len)
    {
        len = bookedCA[_of].length;
    }
    function getBookedCA_index(address _of , uint index) constant returns(uint valid ,uint val)
    {
        valid = bookedCA[_of][index].validUpto;
        val = bookedCA[_of][index].amount;
    }
    function getDepositCN_CoverLength(address _of , uint coverid) constant returns(uint len)
    {
        len = depositCN_Cover[_of][coverid].length;
    }
    function getDepositCN_Cover_Index(address _of , uint coverid , uint index) constant returns(uint valid ,uint val)
    {
        valid = depositCN_Cover[_of][coverid][index].validUpto;
        val = depositCN_Cover[_of][coverid][index].amount;
    }
    function updateDepositCN_Cover_Index(address _of , uint coverid,uint index,uint _timestamp , uint amount1) onlyInternal
    {
        depositCN_Cover[_of][coverid][index].validUpto = _timestamp;
        depositCN_Cover[_of][coverid][index].amount = amount1;
    }
    function getLockedCN_Cover(address _of , uint coverid)constant returns(uint valid ,uint val)
    {
        valid = lockedCN_Cover[_of][coverid].validUpto;
        val = lockedCN_Cover[_of][coverid].amount;
    }
    function updateLockedCN_Cover(address _of , uint coverid,uint timestamp , uint amount1) onlyInternal
    {
        lockedCN_Cover[_of][coverid].validUpto = timestamp;
        lockedCN_Cover[_of][coverid].amount = amount1;
    }
    
    
    
    
    
   
    function getBalanceCAWithAddress(address _to) constant returns (uint sum)
    {
        sum=0;
        for(uint i=0 ; i < lockedCA[_to].length ;i++ )
        {
            if(now<lockedCA[_to][i].validUpto)
                sum+=lockedCA[_to][i].amount;
        }
    } 
    function getBalanceCN(address _to) constant returns (uint sum)
    {
        sum=0;
        for(uint i=0 ; i < lockedCN[_to].length ;i++ )
        {
            if(now<lockedCN[_to][i].validUpto)
                sum+=lockedCN[_to][i].amount;
        } 
       
    } 
    function getBalanceSD(address _to) constant returns (uint sum)
    {
        sum=0;
        for(uint i=0 ; i < lockedSD[_to].length ;i++ )
        {
            if(now<lockedSD[_to][i].validUpto)
                sum+=lockedSD[_to][i].amount;
        }
    }   
    function getBookedCA(address _to) constant returns (uint sum)
    {
        sum=0;
        for(uint i=0 ; i < bookedCA[_to].length ;i++ )
        {
            if(now<bookedCA[_to][i].validUpto)
                sum+=bookedCA[_to][i].amount;
        }
    }  
    function getAvailableCAToken(address _of) constant returns (uint sum)
    {
        sum=0;
        for(uint i=0 ; i < lockedCA[_of].length ;i++ )
        {
            if(now + minVoteLockPeriod < lockedCA[_of][i].validUpto)
                sum+=lockedCA[_of][i].amount;
        }
        sum=sum-getBookedCA(_of);
    }  
    function getDepositCN(uint coverId , address _of) constant returns (uint sum)
    {
        sum=0;
        for(uint i=0 ; i < depositCN_Cover[_of][coverId].length ;i++ )
        {
            if(now < depositCN_Cover[_of][coverId][i].validUpto)
                sum+=depositCN_Cover[_of][coverId][i].amount;
        }
    }  
    function getBalanceLockedTokens(uint coverId , address _of) constant returns(uint amt)
    {
        uint lockedTokens=0;
        if(lockedCN_Cover[_of][coverId].validUpto > now)
            lockedTokens = lockedCN_Cover[_of][coverId].amount;
        amt = lockedTokens - getDepositCN(coverId , _of);
    }

    

    function lockCA(address _of , uint _timestamp ,uint _value) onlyInternal
    {
        lockedCA[_of].push(lockToken(_timestamp,_value));
    }
    
    function lockSD(address _of , uint _timestamp ,uint _value) onlyInternal
    {
        lockedSD[_of].push(lockToken(_timestamp,_value));        
    }
    function pushInLockedCN(address _of , uint _timestamp , uint amount) onlyInternal
    {
        lockedCN[_of].push(lockToken(_timestamp,amount));
    }
    function pushInLockedCN_Cover(address _of ,uint coverid , uint _timestamp , uint amount) onlyInternal
    {
        lockedCN_Cover[_of][coverid]=lockToken(_timestamp,amount);
    }
    function pushInBurnCAToken(address _of , uint claimid, uint timestamp , uint amount) onlyInternal
    {
        burnCAToken[_of][claimid].push(lockToken(timestamp , amount));
    }
    function pushInBookedCA(address _of , uint _timestamp ,uint value) onlyInternal
    {
        bookedCA[_of].push(lockToken(_timestamp , value));
    }
    function pushInDepositCN_Cover(address _of , uint coverid , uint timestamp , uint amount1) onlyInternal
    {
        depositCN_Cover[_of][coverid].push(lockToken(timestamp , amount1));
    }
    
 

}

