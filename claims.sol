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
    
    /// @dev Sets the minimum, maximum claims assessment voting, escalation and payout retry times 
    /// @param _mintime Minimum time (in seconds) for which claims assessment voting is open
    /// @param _maxtime Maximum time (in seconds) for which claims assessment voting is open
    /// @param escaltime Time (in seconds) in which, after a denial by claims assessor, a person can escalate a claim for member voting
    /// @param payouttime Time (in seconds) after which a payout is retried(in case a claim is accepted and payout fails)
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
   
    /// @dev Adds status names for Claims.
    function pushStatus(string stat) onlyInternal
    {
        claimStatus_desc.push(stat);
    }
    
    function changeClaimRewardAddress(address _add) onlyInternal
    {
        claims_rewardAddress = _add;
    }
    /// @dev Gets the total number of claims assessor tokens used to vote for a given ClaimId
    function getCaClaimVotes_token(uint claimid) constant returns(uint cnt)
    {
       c1=claimsData(claimsDataAddress);
       return(c1.getCaClaimVotes_token(claimid));
    }
    /// @dev Gets the total number of member tokens used to vote for a given ClaimId
    function getMemberClaimVotes_token(uint claimid) constant returns(uint cnt)
    {
          c1=claimsData(claimsDataAddress);
       return(c1.getMemberClaimVotes_token(claimid));
    }
    /// @dev Rewards tokens to a Claim Assessor for a vote cast against a given claimid
    /// @param claimid Claim Id.
    /// @param index index of vote against claimid.
    /// @param tokens Number of tokens to be  rewarded.
    function updateRewardCA(uint claimid ,uint index, uint tokens) onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.updateRewardCA(claimid,index,tokens);
    }
     /// @dev Rewards tokens to a member for a vote cast against a given claimid
    /// @param claimid Claim Id.
    /// @param index index of vote against claimid.
    /// @param tokens Number of tokens to be rewarded.
    function updateRewardMV(uint claimid ,uint index, uint tokens) onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.updateRewardMV(claimid,index,tokens);
    }
    /// @dev Gets the Number of tokens used in a specific vote, using claim id and index.
    /// @param ca 1 for vote given as a CA, 0 for vote given as a member.
    /// @return tok Number of tokens.
    function getvoteToken(uint claimid,uint index,uint ca) constant returns (uint tok)
    {
        c1=claimsData(claimsDataAddress);
        tok = c1.getvoteToken(claimid,index,ca);
    }
    /// @dev Gets the Voter's address of a vote using claim id and index.
    /// @param ca 1 for vote given as a CA, 0 for vote given as a member.
    /// @return voter Voter's address.
    function getvoteVoter(uint claimid,uint index,uint ca) constant returns (address voter)
    {
        c1=claimsData(claimsDataAddress);
        voter = c1.getvoteVoter(claimid,index,ca);
    }
    /// @dev Gets claim details of claim id=pending claim start + given index
    function getClaimFromNewStart(uint index)constant returns(string status , uint coverid , uint claimid , int voteCA , int voteMV , uint statusnumber)
    {
           c1=claimsData(claimsDataAddress);
       (coverid,claimid,voteCA,voteMV,statusnumber)=c1.getClaimFromNewStart(index,msg.sender);
       status = claimStatus_desc[statusnumber];

    }
     /// @dev Gets the voter's address of a given vote id.
    function getvoter_vote(uint voteid) constant returns(address voter)
    {
        c1=claimsData(claimsDataAddress);
        return (c1.getvoter_vote(voteid));
    }
    /// @dev Gets claim details of a given claim id
    /// @param claimid Claim Id.
    /// @return coverId cover against which claim has been submitted
    /// @return date_submit timestamp at which claim is submitted
    /// @return vote final verdict of claim
    /// @return status current claim status
    /// @return date_upd last timestamp at which claim has been updated
    /// @return state16Count number of times payout has been retried
    function getClaim(uint claimid) constant returns( uint claimId,uint coverId,uint date_submit,int vote,uint status,uint date_upd,uint state16Count)
    {
        c1=claimsData(claimsDataAddress);
        return(c1.getClaim(claimid));
    }
    /// @dev Gets details of a claim submitted by the calling user, at a given index
    function getUserClaimByIndex(uint index)constant returns(string status , uint coverid , uint claimid)
    {
        c1=claimsData(claimsDataAddress);
        uint statusno;
        (statusno,coverid,claimid) = c1.getUserClaimByIndex(index,msg.sender);
        status = claimStatus_desc[statusno];
    }
    /// @dev Gets last updated timestamp of a claim.
    function getClaimUpdate(uint claimid) constant returns(uint upd)
    {
        c1=claimsData(claimsDataAddress);
        upd=c1.getClaimUpdate(claimid);
    }
   
    /// @dev Gets the total number of votes cast against given claim id.
    /// @param claimid Claim Id.
    /// @param ca if 1 : returns the number of votes cast as Claim Assessors , else returns the number of votes cast as a member
    /// @return len total number of votes cast against given claimid.
    function getClaimVoteLength(uint claimid,uint ca) constant returns(uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.getClaimVoteLength(claimid,ca);
    }
    /// @dev Sets the final vote result(either accept or decline)of a given claimid.
    /// @param claimid Claim Id.
    /// @param verdict 1 if claim is accepted,-1 if declined.
    function changeFinalVerdict(uint claimid,int verdict) onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.changeFinalVerdict(claimid,verdict);
    }
     
     /// @dev Gets total number of claims submitted by a user till date.
    function getUserClaimCount() constant returns(uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.getUserClaimCount(msg.sender);
    }

    /// @dev Gets total number of claims pending for decision.
    function getClaimLength() constant returns (uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.getClaimLength(); 
    }
     /// @dev Gets total number of claims submitted till date.
    function actualClaimLength() constant returns (uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.actualClaimLength();
    }
  
    // @dev Gets details of a given claim id.
    /// @param ind Claim Id.
    /// @return quoteid QuoteId linked to the claim id
    /// @return status Current status of claim id
    /// @return dateAdd Claim Submission date
    /// @return finalVerdict Decision made on the claim, 1 in case of acceptance, -1 in case of denial
    /// @return claimOwner Address through which claim is submitted
    /// @return coverid Coverid associated with the claim id

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
    /// @dev Gets details of a given vote id
    /// @param voteid Vote Id.
    /// @return tokens Number of tokens used by the voter to cast a vote
    /// @return claimId Claim Id being assessed
    /// @return verdict Vote: -1 in case of denail,1 in case of acceptance
    /// @return date_submit Date on which vote is cast
    /// @return tokenRec Number of tokens received for the vote casted
    /// @return voter Voter Address
    /// @return burned Number of tokens burnt by advisory board(in case of fraudulent voting)
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
    /// @dev Gets number of tokens used by a given address to assess a given claimid 
    /// @param _of User's address.
    /// @param claimid Claim Id.
    /// @return value Number of tokens.
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

    /// @dev Calculates total amount that has been used to assess a claim. 
    /// Computaion:Adds acceptCA(tokens used for voting in favor a claim) and denyCA(tokens used for voting against a claim) *  current token price.
    /// @param claimid Claim Id.
    /// @param member Member type 0 for calculating the amount used by Claim Assessors, else result gives amount used by members.
    /// @return Tokens Total Amount used in claims assessment.
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
    /// @dev Checks if voting of a claim should be closed or not. Internally called by checkVoteClosing method for claims whose status number is 0 or status number lie between 2 and 6.
    /// @param claimid Claim Id.
    /// @param status Current status of claim.
    /// @return close 1 if voting should be closed,0 in case voting should not be closed,-1 if voting has already been closed.
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
    /// @dev Checks if voting of a claim should be closed or not.
    /// @param claimid Claim Id.
    /// @return close 1 if voting should be closed, 0 if voting should not be closed,-1 if voting has already been closed.
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
    /// @dev Changes the status of an existing claim id, based on current status and current conditions of the system
    /// @param claimid Claim Id.
    /// @param stat status number.
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
   
    /// @dev Updates the pending claim start variable, which is the lowest claim id with a pending decision/payout.
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