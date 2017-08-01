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
import "./quotation.sol";
import "./MCR.sol";
import "./NXMTokenData.sol";
import "./NXMToken2.sol";
import "./master.sol";
import "./NXMToken3.sol";
pragma solidity ^0.4.8;

contract NXMToken {
/* ERC20 Public variables of the token */
    master ms1;
    address masterAddress;
    address quotationContact;
    address mcrAddress;
    address nxmtoken2Address;
    address nxmtoken3Address;
    address tokenDataAddress;   
    quotation q1;    
    MCR m1;
    NXMTokenData td1;
    address owner;
    NXMToken2 t2;
    NXMToken3 t3;

   
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);
    event Burn(address indexed _of,bytes16 eventName , uint coverId ,uint tokens);
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
    function NXMToken() 
    {
        owner = msg.sender;
    }
    
    function changeMCRAddress(address _to) onlyInternal
    {
        mcrAddress = _to;
        t2=NXMToken2(nxmtoken2Address);
        t2.changeMCRAddress(_to);
         t3=NXMToken3(nxmtoken3Address);
        t3.changeMCRAddress(_to);
    }
     function changeToken2Address(address _to) onlyInternal
    {
        nxmtoken2Address = _to;
    }
     function changeToken3Address(address _to) onlyInternal
    {
        nxmtoken3Address = _to;
    }
    function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td1 = NXMTokenData(tokenDataAddress);
        t2=NXMToken2(nxmtoken2Address);
        t2.changeTokenDataAddress(_add);
         t3=NXMToken3(nxmtoken3Address);
        t3.changeTokenDataAddress(_add);
    }

  
    function allocateFounderTokens(address _to , uint tokens) onlyOwner
    {
        td1 = NXMTokenData(tokenDataAddress);
        if(td1.getCurrentFounderTokens() + tokens <= td1.getInitialFounderTokens())
        {
            td1.changeCurrentFounderTokens(td1.currentFounderTokens()+tokens);
            td1.addInAllocatedFounderTokens(_to , tokens);
            t2=NXMToken2(nxmtoken2Address);
            t2.rewardToken(_to,tokens*1000000000000000000);
        }
    }
   
    
   

    
    function totalSupply() constant returns(uint ts)
    {
        td1 = NXMTokenData(tokenDataAddress);
        ts = td1.getTotalSupply();
    }

   
    function allMembers(uint i)constant returns(address _add)
    {
        td1 = NXMTokenData(tokenDataAddress);
        _add = td1.getMember_index(i);
    }

    function addToPoolFund(bytes16 curr , uint amount) onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        td1.changePoolFundValue(curr,td1.getPoolFundValue(curr) + amount);
    }
    function removeFromPoolFund(bytes16 curr , uint amount) onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        uint value = td1.getPoolFundValue(curr);
        if(value<amount)
            td1.changePoolFundValue(curr,0);
        else
            td1.changePoolFundValue(curr,td1.getPoolFundValue(curr) - amount);
    }
    function getPoolFundValue(bytes16 curr) constant returns(uint amount)
    {

        td1 = NXMTokenData(tokenDataAddress);
        amount=td1.getPoolFundValue(curr);
    }
    function bookCATokens(address _to , uint value)  onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        uint bookTime = td1.getBookTime();
        td1.pushBookedCA(_to ,now,td1.getBookTime(),value);
    }
    
    
    
    function getLockCAWithIndex(uint index) constant returns(uint index1 , uint valid , uint amt)
    {
        td1 = NXMTokenData(tokenDataAddress);
        index1=index;
        (valid,amt) = td1.getLockCAWithIndex(msg.sender , index);
    }
    
   function unlockCN(uint coverid) onlyInternal
    {
        td1=NXMTokenData(tokenDataAddress);
        q1=quotation(quotationContact);
        address _to=q1.getMemberAddress(coverid);
        t3=NXMToken3(nxmtoken3Address);
        t3.undepositCN(coverid,1);
        uint validity; 
        uint amount1;
        (validity,amount1) = td1.getLockedCN_Cover(_to,coverid);
        uint len = td1.getLockedCNLength(_to);
        uint vUpto;
        uint amount;
        for(uint i=0;i<len ;i++)
        {
            (vUpto,amount) = td1.getLockedCN_index(_to,i);
            if( vUpto == validity && amount == amount1)
            {
                td1.updateLockedCN(_to,i,now,amount);
                break;
            }
        }
        td1.updateLockedCN_Cover(_to,coverid,now,amount1);
    }

   
      
    
    function getAvailableCAToken() constant returns (uint sum)
    {
        td1 = NXMTokenData(tokenDataAddress);
        // sum=td1.getAvailableCAToken(msg.sender);
        sum=0;uint validUpto;uint amount;
        address _of=msg.sender;
        for(uint i=0 ; i < td1.getLockCALength(_of) ;i++ )
        { 
            (validUpto,amount)= td1.getLockCAWithIndex(_of,i);
            if(now + td1.getMinVoteLockPeriod() < validUpto)
                sum+=amount;
        }
        uint bookedamt=td1.getBookedCA(_of);
        if(sum>bookedamt)
            sum=sum-bookedamt;
        else
             sum=0;
    }  
    
    
    
  
    function balanceOf(address _add) constant returns(uint bal) 
    {
        td1 = NXMTokenData(tokenDataAddress);
        bal = td1.getBalanceOf(_add);
    }
    
    
    function callBurnEvent(address _add,bytes16 str,uint id,uint value) onlyInternal
    {
        Burn(_add,str,id,value);
    }
    function callTransferEvent(address _from,address _to,uint value) onlyInternal
    {
        Transfer(_from, _to, value);
    }
    function transfer(address _to, uint256 _value)  {
        td1 = NXMTokenData(tokenDataAddress);
        if(_value <= 0) throw;
        if (td1.getBalanceOf(msg.sender)-td1.getBalanceCAWithAddress(msg.sender)-td1.getBalanceSD(msg.sender)-td1.getBalanceCN(msg.sender) < _value) throw;           // Check if the sender has enough
        if (td1.getBalanceOf(_to) + _value < td1.getBalanceOf(_to)) throw; // Check for overflows
        td1.changeBalanceOf(msg.sender,td1.getBalanceOf(msg.sender) - _value);                      // Subtract from the sender
        if(td1.getBalanceOf(msg.sender)==0)
            td1.decMemberCounter();
        if(td1.getBalanceOf(_to) == 0)
            td1.incMemberCounter();
        td1.changeBalanceOf(_to,td1.getBalanceOf(_to) + _value);                           // Add the same to the recipient
        if(td1.checkInallMemberArray(_to)==0)
        {
            td1.addInAllMemberArray(_to);
        }
        Transfer(msg.sender, _to, _value);                   // Notify anyone listening that this transfer took place
    }
   
    
 

    function approve(address _spender, uint256 _value) 
    returns (bool success) {
        td1 = NXMTokenData(tokenDataAddress);
        td1.setAllowance(msg.sender,_spender, _value);
        return true;
    }

    function approveAndCall(address _spender, uint256 _value, bytes _extraData) 
    returns (bool success) {
        td1 = NXMTokenData(tokenDataAddress);
        td1.setAllowance(msg.sender,_spender, _value);
        Approval(msg.sender, _spender, _value);

    //call the receiveApproval function on the contract you want to be notified. This crafts the function signature manually so one doesn't have to include a contract in here just for this.
    //receiveApproval(address _from, uint256 _value, address _tokenContract, bytes _extraData)
    //it is assumed that when does this that the call *should* succeed, otherwise one would use vanilla approve instead.
        if(!_spender.call(bytes4(bytes32(sha3("receiveApproval(address,uint256,address,bytes)"))), msg.sender, _value, this, _extraData)) { throw; }
        return true;
    }



    function transferFrom(address _from, address _to, uint256 _value)  
    returns (bool success) {
        td1 = NXMTokenData(tokenDataAddress);
        if (td1.getBalanceOf(_from)-td1.getBalanceCAWithAddress(_from)-td1.getBalanceSD(_from)-td1.getBalanceCN(_from)< _value) throw;                 // Check if the sender has enough
        if (td1.getBalanceOf(_to) + _value < td1.getBalanceOf(_to)) throw;  // Check for overflows
        if (_value > td1.getAllowance(_from,msg.sender)) throw;     // Check allowance
        td1.changeBalanceOf(_from,td1.getBalanceOf(_from) - _value);                    // Subtract from the sender
        if(td1.getBalanceOf(_from)==0)
            td1.decMemberCounter();
        if(td1.getBalanceOf(_to) == 0)
            td1.incMemberCounter();
        td1.changeBalanceOf(_to,td1.getBalanceOf(_to) + _value);                           // Add the same to the recipient
        if(td1.checkInallMemberArray(_to)==0)
        {
            td1.addInAllMemberArray(_to);
        }
        td1.setAllowance(_from,msg.sender,td1.getAllowance(_from,msg.sender) - _value);
        
        Transfer(_from, _to, _value);
        return true;
    }

    function buyToken(uint value , address _to) onlyInternal {
        td1 = NXMTokenData(tokenDataAddress);
        m1=MCR(mcrAddress);
        uint256 amount = (value*1000000000000000000)/m1.calculateTokenPrice("ETH");  // amount that was sent
        td1.changePoolFundValue("ETH",td1.getPoolFundValue("ETH")+value);
        t2=NXMToken2(nxmtoken2Address);           
        t2.rewardToken(_to,amount);
       //
    }
    
    
   
    
   
   
    function getTokenPrice(bytes16 curr) constant returns(uint price)
    {
        m1=MCR(mcrAddress);
       return m1.calculateTokenPrice(curr); 
         
    }
    function burnTokenForFunding(uint tokens , address _of) onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        if(td1.getBalanceOf(_of) < tokens) throw;
        td1.changeBalanceOf(_of,td1.getBalanceOf(_of) + tokens);
        td1.changeCurrencyTokens("ETH",td1.getCurrencyTokens("ETH")-tokens);
        td1.changeTotalSupply(td1.getTotalSupply() - tokens);
        Burn(_of,"BurnForFunding",0,tokens);
    }
   
    
    function changeQuoteAddress(address conad) onlyInternal
    {
        quotationContact=conad;
        t2=NXMToken2(nxmtoken2Address);
        t2.changeQuotationAddress(conad);
         t3=NXMToken3(nxmtoken3Address);
        t3.changeQuoteAddress(conad);
    }

    function getCurrencyWiseTokens(bytes16 curr)constant returns(uint tokens)
    {
        td1 = NXMTokenData(tokenDataAddress);
        tokens = td1.getCurrencyTokens(curr);
    }
    

}

