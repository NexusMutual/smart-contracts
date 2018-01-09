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


pragma solidity 0.4.11;
import "./NXMTokenData.sol";
import "./quotation2.sol";
import "./pool.sol";
import "./MCR.sol";
import "./NXMToken.sol";
import "./master.sol";
//import "./NXMToken3.sol";

contract NXMToken2{
    master ms1;
    address masterAddress;
    quotation2 q1;
    NXMTokenData td1;
    pool p1;
    MCR m1;
    NXMToken t1;
    address tokenAddress;
    //address NXMToken3Address;
    address quotation2Address;
    address tokenDataAddress;
    address poolAddress;
    address mcrAddress;
    event Transfer(address indexed from, address indexed to, uint256 value);
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
    modifier checkPause
    {
        ms1=master(masterAddress);
        require(ms1.isPause()==0);
        _;
    }
    function changeTokenAddress(address _add) onlyInternal
    {

        tokenAddress = _add;
        t1=NXMToken(tokenAddress);
    } 
    //   function changeToken3Address(address _add) onlyInternal
    // {

    //     NXMToken3Address = _add;
       
    // } 
    function changeQuotationAddress(address _add) onlyInternal
    {
        quotation2Address = _add;
        q1=quotation2(quotation2Address);
    }
    function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td1=NXMTokenData(tokenDataAddress);
    }
    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
        p1=pool(poolAddress);
    }
    function changeMCRAddress(address _add) onlyInternal
    {
        mcrAddress = _add;
        m1=MCR(mcrAddress);
    }
    /// @dev Locks tokens against a cover.     
    /// @param premiumCalculated Premium of quotation.
    /// @param quoteCurr Currency type of quotation.
    /// @param quoteCoverPeriod  Cover Period of quotation.
    /// @param quoteCoverId Cover id of a quotation.
    /// @param senderAddress Quotation owner's Ethereum address.
    /// @return amount Number of tokens that are locked
    function lockCN ( uint256 premiumCalculated , bytes4 quoteCurr ,uint32 quoteCoverPeriod ,uint quoteCoverId , address senderAddress) onlyInternal returns (uint amount)
    {
        td1=NXMTokenData(tokenDataAddress);

        uint pastlocked;
        (,pastlocked) = td1.getLockedCN_Cover(senderAddress,quoteCoverId);
        
        if(pastlocked !=0)
            throw;
     
        m1=MCR(mcrAddress);
        premiumCalculated = premiumCalculated*10000000000;
        // Number of tokens to be locked=Tokens worth 5% premium
        amount = (premiumCalculated*50000000000000000)/uint(m1.calculateTokenPrice(quoteCurr)); 
       
        //bytes16 curr = quoteCurr;
        td1.changeCurrencyTokens(quoteCurr , td1.getCurrencyTokens(quoteCurr) + amount);
        
        if(td1.getBalanceOf(senderAddress) == 0)
            td1.incMemberCounter();

        td1.changeBalanceOf(senderAddress,td1.getBalanceOf(senderAddress)+amount);  
        // Adds the owner of cover as a member if not added already.
        if(td1.checkInallMemberArray(senderAddress)==0)
        {
            td1.addInAllMemberArray(senderAddress);
        }
        // Updates the number of Supply Tokens and Pool fund value of a currency.
        td1.changeTotalSupply(td1.getTotalSupply() + amount); 
        //uint ldays=quoteCoverPeriod;
        uint ld=now+ uint(quoteCoverPeriod)*1 days;
        //td1.pushInLockedCN(senderAddress,ld,amount);
        td1.pushInLockedCN_Cover(senderAddress,quoteCoverId,ld,amount);
        td1.changePoolFundValue(quoteCurr , td1.getPoolFundValue(quoteCurr) + premiumCalculated );
        t1=NXMToken(tokenAddress);
        t1.callTransferEvent(0,senderAddress,amount); 
        
    }

   /// @dev Burns tokens used for fraudulent voting against a claim
   /// @param claimid Claim Id.
   /// @param _value number of tokens to be burned
   /// @param _to User's address.
    function burnCAToken(uint claimid , uint _value , address _to) onlyInternal {
         
        td1=NXMTokenData(tokenDataAddress);
        t1=NXMToken(tokenAddress);
        if( td1.getBalanceCAWithAddress(_to) < _value)throw;
        td1.pushInBurnCAToken(_to,claimid,now,_value);
        //Change overall member token balance
        td1.changeBalanceOf(_to,td1.getBalanceOf(_to) - _value); 

        if(td1.getBalanceOf(_to)==0)
            td1.decMemberCounter();
        
        uint rem = _value;
        uint len=td1.getLockedCALength(_to);
        uint vUpto;
        uint amount;
        // Unlock tokens before burning
        for(uint i=0 ; i < len ;i++ )
        {
            (vUpto,amount) = td1.getLockedCA_index(_to , i);
            if(now<vUpto)
            {
                if(rem > amount)
                {
                    rem -= amount;
                    td1.changeLockedCA_Index(_to,i,0);
                }
                else
                {
                    td1.changeLockedCA_Index(_to,i,amount-rem);
                    rem=0;
                    break;
                }
            }
        }
        // Change total supply of NXM Tokens
        t1.callBurnEvent(_to,"BurnCA",claimid,_value);
        td1.changeCurrencyTokens("ETH",td1.getCurrencyTokens("ETH")-_value);
        td1.changeTotalSupply(td1.getTotalSupply() - _value);
        
        t1.callTransferEvent(_to, 0, _value); // notify of the event
       
    }
    /// @dev Allocates tokens against a given address
    /// @param _to User's address.
    /// @param amount Number of tokens rewarded.
     function rewardToken(address _to,uint amount)  onlyInternal  {
      td1 = NXMTokenData(tokenDataAddress);
      //Add new member where applicable
        if(td1.getBalanceOf(_to) == 0)
            td1.incMemberCounter();
        // Change total supply and individual balance of user
        td1.changeBalanceOf(_to, td1.getBalanceOf(_to) + amount);// mint new tokens
        td1.changeTotalSupply(td1.getTotalSupply()+amount); // track the supply
        td1.changeCurrencyTokens("ETH" , td1.getCurrencyTokens("ETH") + amount);
        if(td1.checkInallMemberArray(_to)==0)
        {
            td1.addInAllMemberArray(_to);
        }
        Transfer(0,_to, amount); // notify of the event
       
    }
       
    /// @dev Extends validity period of a given number of tokens, locked for Claim Assessment
    /// @param _to  User's address.
    /// @param _timestamp Timestamp for which tokens will be extended.
    /// @param noOfTokens Number of tokens that will get extended. Should be less than or equal to the number of tokens of selected bond. 
    function extendCAWithAddress(address _to ,uint _timestamp ,uint noOfTokens) onlyInternal
    {
        td1=NXMTokenData(tokenDataAddress);
        t1=NXMToken(tokenAddress);
        noOfTokens = noOfTokens * 10000000000;
        if(td1.getBalanceCAWithAddress(_to) < noOfTokens)throw;
        
        uint rem = noOfTokens;
        uint len = td1.getLockedCALength(_to);
        uint vUpto;
        uint amount;
        for(uint i=0 ; i < len ;i++ )
        {
            (vUpto , amount) = td1.getLockedCA_index(_to , i);
            if(amount>0 && vUpto > now)
            {
                if(rem > amount)
                {
                    rem -= amount;
                    td1.lockCA(_to,vUpto + _timestamp,amount);
                    td1.changeLockedCA_Index(_to,i,0);
                
                }
                else
                {
                    td1.lockCA(_to,vUpto + _timestamp,rem);
                    td1.changeLockedCA_Index(_to,i,amount-rem);
                    rem=0;
                
                    break;
                }
            }
        }
    }
    
    
    /// @dev Burns tokens deposited against a cover, called when a claim submitted against this cover is denied.
    /// @param coverid Cover Id.
    function burnCNToken(uint coverid) onlyInternal {
        
        td1=NXMTokenData(tokenDataAddress);
        q1=quotation2(quotation2Address); 
        uint quoteId = q1.getQuoteId(coverid);
        bytes4 curr= q1.getCurrencyOfQuote(quoteId);
        address _to = q1.getMemberAddress(coverid);
        uint depositedTokens = td1.getDepositCN(coverid,_to);
        if(depositedTokens <= 0)throw;
        t1=NXMToken(tokenAddress);
        //Undeposit all tokens locked against the cover
        undepositCN(coverid,1);
        uint validity;
        uint amount1;
        (validity,amount1) = td1.getLockedCN_Cover(_to,coverid);
        uint len = td1.getLockedCNLength(_to);
        uint vUpto;
        uint amount;
        for(uint i=0;i<len ;i++)
        {
            (vUpto,amount) = td1.getLockedCN_index(_to,i);
            if(vUpto == validity && amount == amount1 )
            {
                td1.updateLockedCN(_to,i,vUpto,amount-depositedTokens);
                break;
            }
        }
        t1=NXMToken(tokenAddress);
        td1.updateLockedCN_Cover(_to,coverid,validity,amount1-depositedTokens);
        t1.callBurnEvent(_to,"Burn", coverid,depositedTokens);
        td1.changeCurrencyTokens(curr,td1.getCurrencyTokens(curr) - depositedTokens);
        // Update NXM token balance against member address and remove member in case overall balance=0
        td1.changeBalanceOf(_to,td1.getBalanceOf(_to) - depositedTokens);
        if(td1.getBalanceOf(_to)==0)
            td1.decMemberCounter();
        td1.changeTotalSupply(td1.getTotalSupply() - depositedTokens);
        
        t1.callTransferEvent(_to, 0, depositedTokens); // notify of the event
      
    }
    /// @dev Deposits locked tokens against a given cover id, called whenever a claim is submitted against a coverid
    /// @param coverid Cover Id.
    /// @param _value number of tokens to deposit.
    /// @param _days Validity of tokens.
    /// @param _to User's address.
    function depositCN(uint coverid,uint _value,uint _days,address _to) onlyInternal
    {
        td1=NXMTokenData(tokenDataAddress);
        uint amount;
        (,amount) = td1.getLockedCN_Cover(_to,coverid);
        if (amount - td1.getDepositCN(coverid,msg.sender) < _value) throw;           // Check if the sender has enough tokens to deposit
        if (_value<=0) throw;
        //_value = _value * 10000000000;
        td1.pushInDepositCN_Cover(_to,coverid,_days,_value);
    }
   
    /// @dev Checks whether a Surplus distribution should be initiated or not.
    /// @return check 1 if Surplus Distribution can be started, 0 otherwise. 
    function checkForSurplusDistrubution() constant returns(uint8 check)
    {
        td1=NXMTokenData(tokenDataAddress);
        m1=MCR(mcrAddress);
        check=0;
        //LAst MCR%>180% and time since last Surplus Distribution>SD Distribution Time
        if(td1.getSDLength()==0)
        {   
            if(m1.getlastMCRPerc() >= 18000)
                check=1;
        }
        else if((td1.getLastDistributionTime() + td1.getsdDistributionTime() < now)&&( m1.getlastMCRPerc() >= 18000))
            check=1;
        
    }
    /// @dev Performs surplus distribution
    /// @dev Calculates the weight of distribution for every members (have tokens locked for SD) and sends them the amount as per their weight value.
    function distributeSurplusDistrubution() checkPause
    {
        td1=NXMTokenData(tokenDataAddress);
        //t1=NXMToken(tokenAddress);
        p1=pool(poolAddress);

         // Recheck whether a surplus distribution should be made or not
         if(checkForSurplusDistrubution()==1)
         {
            uint index = td1.getSDLength();
            // Calculate amount to be distributed
            uint distValue = calSurplusDistributionValue();
            uint totalWeight =0;
            address _add;
            uint len = td1.getAllMembersLength();
            uint i;
           
            for(i=0;i<len;i++)
            {
                 _add = td1.getMember_index(i);
                 // Calculate SD weight for each member
                uint indWeight=calIndWeightForSD(_add);
                
                if(indWeight > 0)
                {
                    td1.addInSDMemberPayHistory(index,_add,indWeight,0);
                    if(td1.getMemberClaimSDId(_add)==0)
                    {
                        td1.addMemberClaimSDId(_add,0);
                    }
                }
                else
                {
                    td1.addInSDMemberPayHistory(index,_add,0,1);
                }
                    
                totalWeight += indWeight;

            }

            if(td1.getSDLength()==0)
                td1.pushInSDHistory(distValue,block.number,distValue,totalWeight);
            else
                td1.pushInSDHistory(distValue,block.number,distValue + td1.getTotalSDTillNow(),totalWeight);
                
         }
    }

    function claimSDPayout(address _add) checkPause
    {
        td1=NXMTokenData(tokenDataAddress);
        p1=pool(poolAddress);
        uint amount=td1.getTotalSDAmountByAddress(_add);
        uint start=td1.getMemberClaimSDId(_add);
        uint end=td1.getSDLength();
        if(amount > 0)
        { 
            // Initiate SD payout
            bool succ = p1.SDPayout(amount,_add);
            if(succ == true)
            {
                for(uint i=start;i<end;i++)
                {
                    td1.confirmSDDistribution(i,_add);
                }   
                td1.addMemberClaimSDId(_add,end);
            }
        }
    }


 //NXMToken3

 
  /// @dev Calculates the surplus distribution weight of an NXM member. 
    /// @param _add User's address.
    /// @return weight Weight represents the proportion of surplus distribution a member should receive
    function calIndWeightForSD(address _add)  constant returns(uint weight)  
    {
        td1=NXMTokenData(tokenDataAddress);
        weight =0;
        if(td1.checkInallMemberArray(_add)==1)
        {
            //Get number of tokens locked for SD
            uint len1 = td1.getLockedSDLength(_add);
            uint vUpto;
            uint amount;
            for(uint j=0;j<len1;j++)
            {
                (vUpto,amount) = td1.getLockedSD_index(_add,j);
                if(vUpto > now)
                {
                    //Calculate weight based on number of tokens locked under SD and the time period for which they are valid
                    weight =weight + ((vUpto - now)*amount)/1 days;
                }
            }
        }
    }
   
    /// @dev Extends validity period of a given number of tokens locked for claims assessment.
    /// @param index  index of exisiting bond.
    /// @param _days number of days for which tokens will be extended.
    /// @param noOfTokens Number of tokens that will get extended. Should be less than or equal to the no.of tokens of selected bond.
    function extendCA(uint index , uint _days ,uint noOfTokens) checkPause
    {
        td1=NXMTokenData(tokenDataAddress);
        uint vUpto;
        uint amount;
        (vUpto,amount) = td1.getLockedCA_index(msg.sender,index);
        if(vUpto <now || amount < noOfTokens )throw;
        td1.changeLockedCA_Index(msg.sender,index,amount-noOfTokens);
        td1.lockCA(msg.sender,(vUpto + _days* 1 days ),noOfTokens);
               
    }
    /// @dev Unlocks tokens deposited against a cover.Changes the validity timestamp of deposit tokens.
    /// @dev In order to submit a claim,20% tokens are deposited by the owner. In case a claim is escalated, another 20% tokens are deposited.
    /// @param coverid Cover Id.
    /// @param all 0 in case we want only 1 undeposit against a cover,1 in order to undeposit all deposits against a cover
    function undepositCN(uint coverid, uint8 all) onlyInternal
    {   
        td1=NXMTokenData(tokenDataAddress);
        q1=quotation2(quotation2Address);
        address _to=q1.getMemberAddress(coverid);
        if (td1.getDepositCN(coverid , _to) < 0) throw;           // Check if the cover has tokens
        uint len = td1.getDepositCN_CoverLength(_to,coverid);
        uint vUpto;
        uint amount;
       for(uint i=0;i<len;i++)
       {
           (vUpto,amount) = td1.getDepositCN_Cover_Index(_to,coverid,i);
            if(vUpto>=now)
            {
                td1.updateDepositCN_Cover_Index(_to,coverid,i,now,amount);
                if(all==0)
                    break;
            }

       }
    }
  /// @dev Calculates the number of tokens to be distributed in a Surplus Distribution  
  function calSurplusDistributionValue() constant returns(uint finalValue)
    {
        p1=pool(poolAddress);
        td1=NXMTokenData(tokenDataAddress);
        m1=MCR(mcrAddress);
        uint val1;
        uint val2;
        uint val3;
        uint totalTokens = 0;
        uint toDistributeValue;
        uint len = td1.getAllMembersLength();
        for(uint i=0;i<len;i++)
        {
            address _add = td1.getMember_index(i);
            if(td1.checkInallMemberArray(_add)==1)
            {
                uint len1 = td1.getLockedSDLength(_add);
                uint vUpto;
                uint amount;
                for(uint j=0;j<len1;j++)
                {
                    (vUpto,amount) = td1.getLockedSD_index(_add,j);
                    if(vUpto > now)
                        totalTokens +=amount;
                }
            }
        }
        //val1 = 0.1 ETH per locked Token
        val1 = totalTokens/10;
        //val2=5% of last MCR Eth
        val2 = ((5*m1.getLastMCREtherFull())/100)*10000000000000000;
        //val3=50% of Total ETH in pool
        val3=(50*p1.getEtherPoolBalance())/100;

        if(val1 <= val2 && val1 <= val3)
            toDistributeValue = val1;
        else if(val2 <= val1 && val2 <= val3)
            toDistributeValue = val2;
        else if(val3 <= val1 && val3 <= val2)
            toDistributeValue = val3;

        finalValue = toDistributeValue;
    }
    /// @dev Locks a given number of tokens for Claim Assessment.
    /// @param _value number of tokens lock.
    /// @param _days Validity(in days) of tokens.
    function lockCA(uint _value,uint _days) checkPause
    {
        td1 = NXMTokenData(tokenDataAddress);
        if (td1.getBalanceOf(msg.sender)-td1.getBalanceCAWithAddress(msg.sender)-td1.getBalanceSD(msg.sender)-td1.getBalanceCN(msg.sender) < _value) throw;// Check if the sender has enough
        if (_value<=0) throw;
        td1.lockCA(msg.sender,now+_days*1 days,_value);        
    }
    /// @dev Locks a given number of tokens for Surplus Distribution.
    /// @param _value number of tokens lock.
    /// @param _days Validity(in days) of tokens.
    function lockSD(uint _value,uint _days) checkPause
    {
        td1 = NXMTokenData(tokenDataAddress);
        if (td1.getBalanceOf(msg.sender)-td1.getBalanceCAWithAddress(msg.sender)-td1.getBalanceSD(msg.sender)-td1.getBalanceCN(msg.sender) < _value) throw;  // Check if the sender has enough
        if (_value<=0) throw;
        td1.lockSD(msg.sender,now+_days*1 days,_value);        
        
    }
    
    /// @dev Extends the lock period of member tokens, as a punishment, if a user's decision is against of final decision of claim.
    /// @dev _to User's address
    /// @dev _days Extended no. of days.
    /// @dev token Number of tokens that will get extended.
    function lockSDWithAddress(address _to , uint _days , uint tokens) onlyInternal
    {
        td1 = NXMTokenData(tokenDataAddress);
        uint sum=0;
        tokens = tokens * 10000000000;
        uint len = td1.getLockedSDLength(_to);
        uint vUpto;
        uint amount;
        for(uint i=0 ; i < len ;i++ )
        {
            (vUpto,amount) = td1.getLockedSD_index(_to,i);
            if( (now + 3*1 days )< vUpto )
                sum+=amount;
        }
        if(sum<tokens)
        {
            uint tokensToLock = tokens-sum;
            uint availableTokens = td1.getBalanceOf(_to)-td1.getBalanceCAWithAddress(_to)-td1.getBalanceSD(_to)-td1.getBalanceCN(_to) ;
            if(availableTokens >= tokensToLock)
            {
                td1.lockSD(_to,(now+_days*1 days),tokensToLock);
            }
            else if(availableTokens > 0)
            {
                td1.lockSD(_to,now+_days*1 days,availableTokens);
            }
        }
    }
   
    
}