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
import "./NXMToken.sol";
import "./NXMToken2.sol";
import "./pool.sol";
import "./claims_Reward.sol";
import "./governance.sol";
import "./claimsData.sol";
import "./master.sol";
import "./NXMTokenData.sol";



contract claims{
    
    string[]  claimStatus_desc;
    
     NXMToken2 tc2;
    address public token2Address;
    address  tokenAddress;
    address  quotationAddress;
    address  claims_rewardAddress;
    address poolAddress;
    address governanceAddress;    
    address claimsDataAddress;
    address tokenDataAddress;   
    NXMToken tc1;
    quotation q1;
    master ms1;
     NXMTokenData td1;
    address masterAddress;
    claims_Reward cr1;
    pool p1;
    governance g1;
    claimsData c1;
    
    
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
     function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td1 = NXMTokenData(tokenDataAddress);
    }
    
    function setTimes(uint _mintime,uint _maxtime,uint escaltime,uint payouttime)  onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.setEscalationTime(escaltime);
        c1.setPayoutRetryTime(payouttime);
        c1.setMaxTime(_maxtime);
        c1.setMinTime(_mintime);
       
    }
    function changeToken2Address(address _add) onlyInternal
    {
        token2Address = _add;
        tc2 = NXMToken2(token2Address);
    }
    function changeClaimDataAddress(address _add) onlyInternal
    {
        claimsDataAddress = _add;
    }
    function changeGovernanceAddress(address _add) onlyInternal
    {
        governanceAddress = _add;
    }
    function changePoolAddress(address poolAdd) onlyInternal
    {
        poolAddress = poolAdd;
    }
     function changeTokenAddress(address newAddress) onlyInternal
    {
        tokenAddress = newAddress;
    }
      function changeQuotationAddress(address newAddress) onlyInternal
    {
        quotationAddress = newAddress;
    }
   
    function pushStatus(string stat) onlyInternal
    {
        claimStatus_desc.push(stat);
    }
    
    function changeClaimRewardAddress(address _add) onlyInternal
    {
        claims_rewardAddress = _add;
    }
    
    function getCaClaimVotes_token(uint claimid) constant returns(uint cnt)
    {
       c1=claimsData(claimsDataAddress);
       return(c1.getCaClaimVotes_token(claimid));
    }
    function getMemberClaimVotes_token(uint claimid) constant returns(uint cnt)
    {
          c1=claimsData(claimsDataAddress);
       return(c1.getMemberClaimVotes_token(claimid));
    }
    function updateRewardCA(uint claimid ,uint index, uint tokens) onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.updateRewardCA(claimid,index,tokens);
    }
    function updateRewardMV(uint claimid ,uint index, uint tokens) onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.updateRewardMV(claimid,index,tokens);
    }
    function getvoteToken(uint claimid,uint index,uint ca) constant returns (uint tok)
    {
        c1=claimsData(claimsDataAddress);
        tok = c1.getvoteToken(claimid,index,ca);
    }
    function getvoteVoter(uint claimid,uint index,uint ca) constant returns (address voter)
    {
        c1=claimsData(claimsDataAddress);
        voter = c1.getvoteVoter(claimid,index,ca);
    }
    function getClaimFromNewStart(uint index)constant returns(string status , uint coverid , uint claimid , int voteCA , int voteMV , uint statusnumber)
    {
           c1=claimsData(claimsDataAddress);
       (coverid,claimid,voteCA,voteMV,statusnumber)=c1.getClaimFromNewStart(index,msg.sender);
       status = claimStatus_desc[statusnumber];

    }
    function getvoter_vote(uint voteid) constant returns(address voter)
    {
        c1=claimsData(claimsDataAddress);
        return (c1.getvoter_vote(voteid));
    }
    function getClaim(uint claimid) constant returns( uint claimId,uint coverId,uint date_submit,int vote,uint status,uint date_upd,uint state16Count)
    {
        c1=claimsData(claimsDataAddress);
        return(c1.getClaim(claimid));
    }
    function getUserClaimByIndex(uint index)constant returns(string status , uint coverid , uint claimid)
    {
        c1=claimsData(claimsDataAddress);
        uint statusno;
        (statusno,coverid,claimid) = c1.getUserClaimByIndex(index,msg.sender);
        status = claimStatus_desc[statusno];
    }
    function getClaimUpdate(uint claimid) constant returns(uint upd)
    {
        c1=claimsData(claimsDataAddress);
        upd=c1.getClaimUpdate(claimid);
    }
   
   
    function getClaimVoteLength(uint claimid,uint ca) constant returns(uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.getClaimVoteLength(claimid,ca);
    }
    function changeFinalVerdict(uint claimid,int verdict) onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.changeFinalVerdict(claimid,verdict);
    }
     
    
    function getUserClaimCount() constant returns(uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.getUserClaimCount(msg.sender);
    }
    function getClaimLength() constant returns (uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.getClaimLength(); 
    }
    function actualClaimLength() constant returns (uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.actualClaimLength();
    }
  
 
     function getClaimbyIndex(uint ind) constant returns( uint claimId,uint quoteid,string status,uint dateAdd ,int finalVerdict , address claimOwner ,uint coverid) 
    {
        q1=quotation(quotationAddress);
         c1=claimsData(claimsDataAddress);
        
        uint stat;

        (claimId,coverid,dateAdd,,,,)=c1.getClaim(ind);
        (,,,finalVerdict,stat,,) = c1.getClaim(ind);
        
        claimOwner = q1.getMemberAddress(coverid);
        quoteid=q1.getQuoteId(coverid);
        status = claimStatus_desc[stat];          
    }
  
    function getVoteDetailsForAB(uint voteid) constant returns(uint tokens,uint claimId,int verdict, uint date_submit,uint tokenRec,address voter,uint burned)
    {
        g1=governance(governanceAddress);
        c1=claimsData(claimsDataAddress);
        voter = c1.getvoter_vote(voteid);
        int claimVerdict;
        (tokens,claimId,verdict,date_submit,tokenRec,claimVerdict,) = c1.getVoteDetails(voteid);
        uint ifburned = g1.checkIfTokensAlreadyBurned(claimId,voter);
        return(tokens,claimId,verdict,date_submit,tokenRec,voter,ifburned);
    }
 
    function getCATokensLockedAgainstClaim(address _of , uint claimid) constant returns(uint value)
    {
        tc1 = NXMToken(tokenAddress);
        c1=claimsData(claimsDataAddress);
        value = c1.getTokens_claim(_of,claimid);
        td1=NXMTokenData(tokenDataAddress);
        uint totalLockedCA = td1.getBalanceCAWithAddress(_of);
        if(totalLockedCA < value)
            value = totalLockedCA;
    }
     function getCATokens(uint claimid,uint member) constant returns(uint Tokens)
    {
        tc1=NXMToken(tokenAddress);
        q1=quotation(quotationAddress);
         c1=claimsData(claimsDataAddress);
        uint coverid = c1.getClaimCoverId(claimid);
        bytes16 curr = q1.getCurrencyOfCover(coverid);
         uint tokenx1e18=tc1.getTokenPrice(curr);
         uint acceptCA;uint acceptMV;
         uint denyCA;uint denyMV;
         (acceptCA,denyCA)=c1.getClaims_tokenCA(claimid);
         (acceptMV,denyMV)=c1.getClaims_tokenMV(claimid);
         if(member==0)
              Tokens=(acceptCA+denyCA)*tokenx1e18/1000000000000000000; // amount (not in tokens)
        else
        Tokens=(acceptMV+denyMV)*tokenx1e18/1000000000000000000;
        
    }
    function checkVoteClosingFinal(uint claimid,uint status) constant returns(int close)
    {
        close=0;
        tc1=NXMToken(tokenAddress);
        q1=quotation(quotationAddress);
        c1=claimsData(claimsDataAddress);
        uint coverid = c1.getClaimCoverId(claimid);
        bytes16 curr = q1.getCurrencyOfCover(coverid);
        uint tokenx1e18=tc1.getTokenPrice(curr);
        uint acceptCA;uint acceptMV;
        uint denyCA;uint denyMV;
        (acceptCA,denyCA)=c1.getClaims_tokenCA(claimid);
        (acceptMV,denyMV)=c1.getClaims_tokenMV(claimid);
        uint CATokens=(acceptCA+denyCA)*tokenx1e18/1000000000000000000;
            uint MVTokens=(acceptMV+denyMV)*tokenx1e18/1000000000000000000;
        uint sumassured=q1.getSumAssured(coverid)*1000000000000000000;
        if(status==0 && CATokens>=10*sumassured)
            close=1;
        if(status>=2 && status<=6 && MVTokens>=10*sumassured)
            close=1;    
    }
    function checkVoteClosing(uint claimid)constant returns(int close)
    {   
        close=0;
         c1=claimsData(claimsDataAddress);
         uint status=c1.getClaimStatusNumber(claimid); 
         uint date_upd = c1.getClaimDateUpd(claimid);
        if(status==16 && date_upd+ c1.payoutRetryTime() < now )
            if( c1.getClaimState16Count(claimid) < 60)
                close=1;
        if(status>6)
            close=-1;
        else if(status==1 && date_upd + c1.escalationTime() > now)
            close=-1;
        else if(status==1 && date_upd + c1.escalationTime() <= now)
            close=1;
        else if(date_upd+c1.maxtime()<=now) 
            close=1;
        else if(date_upd+ c1.mintime()>=now) 
            close=0;
        else if(status==0 || ( status >= 2 && status <= 6 ) )
        { 
            close = checkVoteClosingFinal(claimid,status);
        }
        
                
    }
    
     
 
    
   
    function setClaimStatus(uint claimid,uint stat) onlyInternal
    {
        cr1=claims_Reward(claims_rewardAddress);
        c1=claimsData(claimsDataAddress);
         uint origstat;
         uint state16Count;
         uint date_upd;
        (,,,,origstat,date_upd,state16Count)=c1.getAllClaimsByIndex(claimid);
        origstat=c1.getClaimStatus(claimid);
        if(stat==16 && origstat==16)
        {
            c1.updatestate16Count(claimid,1);
        }
        c1.setClaimStatus(claimid,stat);
        if(state16Count >= 60 && stat==16)
             c1.setClaimStatus(claimid,17);
        c1.setClaimdate_upd(claimid,now);
        c1.addClaimStatus(claimid,stat,now,block.number);
         p1=pool(poolAddress);
        if(stat >=3 && stat<=6)
        {
           
            p1.closeClaimsOraclise(claimid,c1.maxtime());
        }
        if(stat==16 &&  (date_upd + c1.payoutRetryTime() <= now) && (state16Count < 60))
        {
                cr1.changeClaimStatus(claimid);
        }
        else if(stat==16 &&  (date_upd+ c1.payoutRetryTime() > now) && (state16Count < 60))
        {
            uint timeLeft = date_upd+ c1.payoutRetryTime() -now;
            p1.closeClaimsOraclise(claimid,timeLeft);
        }
    }
   
    function changePendingClaimStart() onlyInternal
    {
         c1=claimsData(claimsDataAddress);
         uint origstat;
         uint state16Count;
       
       
        for(uint i=c1.pendingClaim_start();i<c1.actualClaimLength();i++)
        {
         
        (,,,,origstat,state16Count,)=c1.getAllClaimsByIndex(i);
         
            if(origstat>6 && ((origstat!=16) || (origstat==16 && state16Count >= 60)))
                c1.setpendingClaim_start(i);
            else
                break;
        }
    }

   
  
   
 
    
}