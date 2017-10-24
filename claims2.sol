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
import "./claimsData.sol";
import "./claims.sol";
import "./master.sol";

contract claims2{

    quotation q1;
    NXMToken tc1;
    NXMToken2 tc2;
    pool p1;
    claims_Reward cr1;
    claimsData cd1;
    master ms1;
    address masterAddress;
    claims c1;
    address quotationAddress;
    address tokenAddress;
    address token2Address;
    address poolAddress;
    address claims_RewardAddress;
    address claimsDataAddress;
    address claimsAddress;

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
    function changeToken2Address(address _Add) onlyInternal
    {
        token2Address = _Add;
        tc2=NXMToken2(token2Address);
    }
    function changeQuotationAddress(address _add) onlyInternal
    {
        quotationAddress = _add;
        c1 = claims(claimsAddress);
        c1.changeQuotationAddress(_add);
    }
    function changeTokenAddress(address _add) onlyInternal
    {
        tokenAddress =_add;
        c1 = claims(claimsAddress);
        c1.changeTokenAddress(_add);
    }
    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
    }
    function changeClaimRewardAddress(address _add) onlyInternal
    {
        claims_RewardAddress = _add;
    }
    function changeClaimDataAddress(address _add) onlyInternal
    {
        claimsDataAddress = _add;
        cd1 = claimsData(claimsDataAddress);
    }
    function changeClaimAddress(address _add) onlyInternal
    {
        claimsAddress = _add;
        c1 = claims(claimsAddress);
    }

    /// @dev Submits a claim for a given cover note. Deposits 20% of the tokens locked against cover.
    /// @param coverid Cover Id.
    function submitClaim(uint coverid) 
    {
        
        q1=quotation(quotationAddress);
        address qadd=q1.getMemberAddress(coverid);
        if(qadd != msg.sender) throw;
        tc1=NXMToken(tokenAddress);
         tc2=NXMToken2(token2Address);
        cd1=claimsData(claimsDataAddress);
        uint tokens = q1.getLockedTokens(coverid);
        tokens = tokens*20/100;
        uint timeStamp = now + 1*7 days;
        tc2.depositCN(coverid,tokens,timeStamp,msg.sender);
        uint len = cd1.actualClaimLength();
        cd1.setClaimLength(len+1);
       
        cd1.addClaim(len , coverid , now,0,0,now,0);
        cd1.addClaim_sender(msg.sender,len);
        cd1.addClaimStatus(len,0,now,block.number);
        cd1.addCover_Claim(coverid,len);
        q1.updateCoverStatusAndCount(coverid,"Claim Submitted");
        p1=pool(poolAddress);
        p1.closeClaimsOraclise(len,cd1.maxtime());
        
    }
    /// @dev Members who have tokens locked under Claims Assessment can assess and Vote As a CLAIM ASSESSOR for a given claim id.
    /// @param claimid  claim id. 
    /// @param verdict 1 for Accept,-1 for Deny.
    /// @param tokens number of CAtokens a voter wants to use for the claim assessment. 
    /// These tokens are booked for a specified period for time and hence cannot be used to cst another vote for the specified period
    function submitCAVote(uint claimid,int verdict,uint tokens)
    {  
        cd1=claimsData(claimsDataAddress);
        c1 = claims(claimsAddress);
        if(c1.checkVoteClosing(claimid) == 1) throw;
        if(cd1.getClaimStatus(claimid) != 0) throw;
        if(cd1.getvote_ca(claimid,msg.sender) != 0) throw;
        tc1=NXMToken(tokenAddress);
        tc1.bookCATokens(msg.sender , tokens);
        cd1.addVote(msg.sender,tokens,claimid,verdict,now,0);
        uint vote_length=cd1.vote_length();
        cd1.addclaim_vote_ca(claimid,vote_length);
        cd1.setvote_ca(msg.sender,claimid,vote_length);
        cd1.addvote_address_ca(msg.sender,vote_length);
        cd1.setvote_length(vote_length+1);
        
        cd1.setclaim_tokensCA(claimid,verdict,tokens);
        

        int close = c1.checkVoteClosing(claimid);
        if(close==1)
        {
            cr1=claims_Reward(claims_RewardAddress);
            cr1.changeClaimStatus(claimid);
        }

    }
    /// @dev Escalates a specified claim id. If a claim is denied by the Claim Assessors, the owner of that claim can Escalate the Claim to a member vote.
    /// @param coverId Cover Id associated with claim to be escalated.
    /// @param claimId Claim Id.
    function escalateClaim(uint coverId , uint claimId)
    {  
        tc2 = NXMToken2(token2Address);
        q1=quotation(quotationAddress);
        tc1=NXMToken(tokenAddress);
        address qadd=q1.getMemberAddress(coverId);
        if(qadd != msg.sender) throw;
        uint tokens = q1.getLockedTokens(coverId);
        tokens = tokens*20/100;
        cd1=claimsData(claimsDataAddress);
        uint d=864000 * cd1.escalationTime() ;
        uint timeStamp = now + d;
        tc2.depositCN(coverId,tokens,timeStamp,msg.sender);
         c1 = claims(claimsAddress);
        c1.setClaimStatus(claimId,2);
        q1.updateCoverStatusAndCount(coverId,"Claim Submitted");
        p1=pool(poolAddress);
        p1.closeClaimsOraclise(claimId,cd1.maxtime());
    } 

    /// @dev Submits a member vote for assessing a claim. Tokens other than those locked under Claims Assessment can be used to cast a vote for a given claim id.
    /// @param claimid Selected claim id. 
    /// @param verdict 1 for Accept,-1 for Deny.
    /// @param tokens Number of tokens used to case a vote
    function submitMemberVote(uint claimid,int verdict,uint tokens)
    {
         cd1=claimsData(claimsDataAddress);
         c1 = claims(claimsAddress);
        if(c1.checkVoteClosing(claimid) == 1) throw;
        uint stat=cd1.getClaimStatus(claimid);
       if(stat <2 || stat >6) throw;
        if(cd1.getvote_member(claimid,msg.sender) != 0) throw;
         uint vote_length=cd1.vote_length();
        cd1.addVote(msg.sender,tokens,claimid,verdict,now,0);
        cd1.addclaim_vote_member(claimid,vote_length);
        cd1.setvote_member(msg.sender,claimid,vote_length);
        cd1.addvote_address_member(msg.sender,vote_length);
        cd1.setvote_length(vote_length+1);      
        cd1.setclaim_tokensMV(claimid,verdict,tokens);
        int close = c1.checkVoteClosing(claimid);
        if(close==1)
        {
            cr1=claims_Reward(claims_RewardAddress);
            cr1.changeClaimStatus(claimid);
        }
        
    }
}