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

    /// @dev Allocates tokens to a Founder Member and stores the details. Updates the number of tokens that have been allocated already by the creator till date.
    /// @param _to Member address.
    /// @param tokens Number of tokens.
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
   
    /// Gets the total number of tokens that are in circulation.
    function totalSupply() constant returns(uint ts)
    {
        td1 = NXMTokenData(tokenDataAddress);
        ts = td1.getTotalSupply();
    }

   /// @dev Gets the address of a member using index.
    function allMembers(uint i)constant returns(address _add)
    {
        td1 = NXMTokenData(tokenDataAddress);
        _add = td1.getMember_index(i);
    }

    /// @dev Adds a given amount, in a given currency, to the pool fund 
    function addToPoolFund(bytes16 curr , uint amount) onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        td1.changePoolFundValue(curr,td1.getPoolFundValue(curr) + amount);
    }

    /// @dev Subtracts a given amount from the pool fund.
    function removeFromPoolFund(bytes16 curr , uint amount) onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        uint value = td1.getPoolFundValue(curr);
        if(value<amount)
            td1.changePoolFundValue(curr,0);
        else
            td1.changePoolFundValue(curr,td1.getPoolFundValue(curr) - amount);
    }

    /// @dev Gets Pool's Fund amount of a given currency.
    /// @param curr Currency Name.
    /// @return amount Total fund amount.
    function getPoolFundValue(bytes16 curr) constant returns(uint amount)
    {

        td1 = NXMTokenData(tokenDataAddress);
        amount=td1.getPoolFundValue(curr);
    }

    /// @dev Books the user's tokens for maintaining Assessor Velocity, i.e., these tokens cannot be used to cast another vote for a specified period of time.
    /// @param _to Claims assessor address.
    /// @param value number of tokens that will be booked for a period of time. 
    function bookCATokens(address _to , uint value)  onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        //td1.pushBookedCA(_to ,now,td1.getBookTime(),value);
        td1.pushBookedCA(_to,value);

    }


    /// @dev Gets the validity date and number of tokens locked under CA at a given index of mapping
    /// @return index1 Id of mapping.
    /// @return valid Lock validity (in timestamp)
    /// @return amt Number of tokens locked.
    function getLockCAWithIndex(uint index) constant returns(uint index1 , uint valid , uint amt)
    {
        td1 = NXMTokenData(tokenDataAddress);
        index1=index;
        (valid,amt) = td1.getLockCAWithIndex(msg.sender , index);
    }


    /// @dev Unlocks the Tokens of a given cover id
    function unlockCN(uint coverid) onlyInternal
    {
        td1=NXMTokenData(tokenDataAddress);
        q1=quotation(quotationContact);
        address _to=q1.getMemberAddress(coverid);
        t3=NXMToken3(nxmtoken3Address);
        //Undeposits all tokens associated with the coverid
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
                // Updates the validity of lock to now, thereby ending the lock on tokens
                td1.updateLockedCN(_to,i,now,amount);
                break;
            }
        }
       
        td1.updateLockedCN_Cover(_to,coverid,now,amount1);  
    }

    /// @dev Gets the total number of tokens available for the Claim Assessment.    
    function getAvailableCAToken() constant returns (uint sum)
    {
        td1 = NXMTokenData(tokenDataAddress);
        // sum=td1.getAvailableCAToken(msg.sender);
        sum=0;uint validUpto;uint amount;
        address _of=msg.sender;
        //Tokens locked for at least a specified minimum lock period can be used for voting
        for(uint i=0 ; i < td1.getLockCALength(_of) ;i++ )
        { 
            (validUpto,amount)= td1.getLockCAWithIndex(_of,i);
            if(now + td1.getMinVoteLockPeriod() < validUpto)
                sum+=amount;
        }
        // Booked tokens cannot be used for claims assessment
        uint bookedamt=td1.getBookedCA(_of);
        if(sum>bookedamt)
            sum=sum-bookedamt;
        else
             sum=0;
    }  

    
    /// @dev Gets the Token balance (lock + available) of a given address.
    function balanceOf(address _add) constant returns(uint bal) 
    {
        td1 = NXMTokenData(tokenDataAddress);
        bal = td1.getBalanceOf(_add);
    }
    
    /// @dev Triggers an event when Tokens are burnt.
    function callBurnEvent(address _add,bytes16 str,uint id,uint value) onlyInternal
    {
        Burn(_add,str,id,value);
    }
    /// @dev Triggers an event when Transfer of NXM tokens occur. 
    function callTransferEvent(address _from,address _to,uint value) onlyInternal
    {
        Transfer(_from, _to, value);
    }

    /// @dev Transfer Tokens from the sender to the given Receiver's account.
    /// @param _to Receiver's Address.
    /// @param _value Transfer tokens.
    function transfer(address _to, uint256 _value)  {
        td1 = NXMTokenData(tokenDataAddress);
        if(_value <= 0) throw;
        //available transfer balance=Total Token balance - Locked tokens
        if (td1.getBalanceOf(msg.sender)-td1.getBalanceCAWithAddress(msg.sender)-td1.getBalanceSD(msg.sender)-td1.getBalanceCN(msg.sender) < _value) throw;           // Check if the sender has enough
        if (td1.getBalanceOf(_to) + _value < td1.getBalanceOf(_to)) throw; // Check for overflows
        td1.changeBalanceOf(msg.sender,td1.getBalanceOf(msg.sender) - _value);                      // Subtract from the sender
        if(td1.getBalanceOf(msg.sender)==0)
            td1.decMemberCounter();
        if(td1.getBalanceOf(_to) == 0)
            td1.incMemberCounter();
        td1.changeBalanceOf(_to,td1.getBalanceOf(_to) + _value);                           // Add the same to the recipient
        // Add a new member whenever applicable
        if(td1.checkInallMemberArray(_to)==0)
        {
            td1.addInAllMemberArray(_to);
        }
        Transfer(msg.sender, _to, _value);                   // Notify anyone listening that this transfer took place
    }
   
    /// @dev Allows a given address (Spender) to spend a given amount of the money on behalf of the other user.
    /// @param _spender Spender's address.
    /// @param _value Amount upto which Spender is allowed to transfer.
    function approve(address _spender, uint256 _value) 
    returns (bool success) {
        td1 = NXMTokenData(tokenDataAddress);
        td1.setAllowance(msg.sender,_spender, _value);
        return true;
    }


    /// @dev Allows a given address (Spender) to spend a given amount of the money on behalf of the other user.
    /// @param _spender Spender's address.
    /// @param _value amount upto which Spender is allowed to transfer.
    /// @param _extraData Extra Data.
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

    /// @dev Transfer the Tokens from a given sender's Address to a given receiver's address. If the msg.sender is not allowed to transfer tokens on the behalf of the _from , then transfer will be unsuccessful.
    /// @param _from Sender's address.
    /// @param _to Receiver's address.
    /// @param _value Transfer tokens.
     /// return success true if transfer is a success, false if transfer is a failure.
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

    /// @dev User can buy the NXMTokens equivalent to the amount paid by the user.
    function buyToken(uint value , address _to) onlyInternal {
        td1 = NXMTokenData(tokenDataAddress);
        m1=MCR(mcrAddress);
        uint256 amount = (value*1000000000000000000)/m1.calculateTokenPrice("ETH");  // number of tokens to be allocated
        td1.changePoolFundValue("ETH",td1.getPoolFundValue("ETH")+value);
        t2=NXMToken2(nxmtoken2Address);  
        // Allocate tokens         
        t2.rewardToken(_to,amount);
    }
   
   /// @dev Gets the Token price in a given currency
   /// @param curr Currency name.
   /// @return price Token Price.
    function getTokenPrice(bytes16 curr) constant returns(uint price)
    {
        m1=MCR(mcrAddress);
       return m1.calculateTokenPrice(curr); 
         
    }

    /// @dev Burns the NXM Tokens of a given address. Updates the balance of the user and total supply of the tokens. 
    /// @param tokens Number of tokens
    /// @param _of User's address.
    function burnTokenForFunding(uint tokens , address _of) onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        if(td1.getBalanceOf(_of) < tokens) throw;
        td1.changeBalanceOf(_of,td1.getBalanceOf(_of) - tokens);
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
    /// @dev Gets the number of tokens of a given currency.
    /// @param curr Currency name.
    /// @return tokens Number of tokens.
    function getCurrencyWiseTokens(bytes16 curr)constant returns(uint tokens)
    {
        td1 = NXMTokenData(tokenDataAddress);
        tokens = td1.getCurrencyTokens(curr);
    }
    

}

