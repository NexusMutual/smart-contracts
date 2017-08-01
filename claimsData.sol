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

contract claimsData{
    master ms1;
    address masterAddress;
    
    struct claim {
        uint claimId;
        uint coverId;
        uint date_submit;
        int vote;
        uint status;
        uint date_upd;
        uint state16Count;
        
    }
    struct claimStatus{
        uint status;
        uint date_upd;
        uint blockNumber;
    }
    struct claim_totalTokens
    {
        uint accept;
        uint deny;
    }
    claim[]  allClaims;
    vote[]  allvotes;
    uint public vote_length;
    uint public claim_length;
    mapping(uint=>uint[])  cover_claim;
    mapping(uint=>claimStatus[]) public claim_status;   
    mapping(uint=>uint[])  claim_vote_ca;
    mapping(uint=>uint[])  claim_vote_member;
    mapping(address=>mapping(uint=>uint))  vote_ca;
    mapping(address=>mapping(uint=>uint))  vote_member;
    mapping(address=>uint[])  vote_address_ca;
    mapping(address=>uint[])  vote_address_member;
    mapping(address=>uint[])  allClaimsByAddress;
    mapping(uint=>claim_totalTokens)  claim_tokensCA;
    mapping(uint=>claim_totalTokens)  claim_tokensMV;
    
    uint public maxtime;
    uint public mintime;
   
    uint public pendingClaim_start;
    uint public payoutRetryTime;
    uint public escalationTime;
    struct vote{
        address voter;
        uint tokens;
        uint claimId;
        int verdict;
        uint date_submit;
        uint tokenRec;
            }
    
    function claimsData()
    {
        escalationTime = 3600;
        pendingClaim_start = 0;
        claim_length = 0;
        maxtime = 1800;
        mintime=1200;
        payoutRetryTime=24*60*60;
        
        allvotes.push(vote(0,0,0,0,now,0));
        vote_length = 1;
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
    modifier onlyOwner{
        ms1=master(masterAddress);
        require(ms1.isOwner(msg.sender) == 1);
        _; 
    }
    modifier onlyInternal {
        ms1=master(masterAddress);
        require(ms1.isInternal(msg.sender) == 1);
        _; 
    }
    function setEscalationTime(uint _time) onlyInternal
    {
        escalationTime=_time;
    }
     function setMaxTime(uint _time) onlyInternal
    {
        maxtime=_time;
    }
    function setMinTime(uint _time) onlyInternal
    {
        mintime=_time;
    }
    function setPayoutRetryTime(uint _time) onlyInternal
    {
        payoutRetryTime=_time;
    }
    function setClaimLength(uint len) onlyInternal
    {
        if(len<claim_length) throw;
        claim_length=len;
    }

    function getAllClaimsByIndex(uint index) constant returns(uint claimId,uint coverId,uint date_submit,int vote,uint status,uint date_upd,uint state16Count)
    {
        return(allClaims[index].claimId,allClaims[index].coverId,allClaims[index].date_submit,allClaims[index].vote,allClaims[index].status,allClaims[index].date_upd,allClaims[index].state16Count);
    }
   
   function getClaim_status(uint claimid,uint index) constant returns( uint status,uint date_upd,uint blockNumber)
   {
       return(claim_status[claimid][index].status,claim_status[claimid][index].date_upd,claim_status[claimid][index].blockNumber);
   }
   function getCover_claim(uint index) constant returns(uint[] claims)
   {
       return cover_claim[index];
   }    
   function getvote_ca(uint claimid,address _ca) constant returns(uint id_vote)
   {
       return vote_ca[_ca][claimid];
   }
    function getvote_member(uint claimid,address _member) constant returns(uint id_vote)
   {
       return vote_member[_member][claimid];
   }
   function getvote_address_ca(address _ca) constant returns(uint[] votearr)
   {
       return vote_address_ca[_ca];
   }
   function getvote_address_member(address _member) constant returns(uint[] votearr)
   {
       return vote_address_member[_member];
   }
    function getClaimStatusNumber(uint id)constant returns(uint statno)
    {
        statno = allClaims[id].status;
    }
    function getClaimState16Count(uint id)constant returns(uint num)
    {
        num = allClaims[id].state16Count;
    }
    function getClaimDateUpd(uint id) constant returns(uint dateupd)
    {
        dateupd = allClaims[id].date_upd;
    }
    function getAllClaimsByAddress(address _member) constant returns(uint[] claimarr)
    {
        return allClaimsByAddress[_member];
    }
    function getClaims_tokenCA(uint claimid) constant returns(uint accept,uint deny)
    {
        return (claim_tokensCA[claimid].accept,claim_tokensCA[claimid].deny);
    }
     function getClaims_tokenMV(uint claimid) constant returns(uint accept,uint deny)
    {
         return (claim_tokensMV[claimid].accept,claim_tokensMV[claimid].deny);
    }
   
    function getCaClaimVotes_token(uint claimid) constant returns(uint cnt)
    {cnt=0;
        for(uint i=0;i<claim_vote_ca[claimid].length;i++)
        {
            cnt+=allvotes[claim_vote_ca[claimid][i]].tokens;
        }
    }
    function getMemberClaimVotes_token(uint claimid) constant returns(uint cnt)
    {cnt=0;
        for(uint i=0;i<claim_vote_member[claimid].length;i++)
        {
            cnt+=allvotes[claim_vote_member[claimid][i]].tokens;
        }
    }
    function getUserVotes() constant returns(uint[] cavote,uint []mvote)
    {
        return(vote_address_ca[msg.sender],vote_address_member[msg.sender]);
        
        
    }
    function getVoteDetails(uint voteid) constant returns(uint tokens,uint claimId,int verdict, uint date_submit,uint tokenRec,int claimVerdict,uint status)
    {
        int decision = allClaims[allvotes[voteid].claimId].vote;
        status= allClaims[allvotes[voteid].claimId].status;
        return (allvotes[voteid].tokens,allvotes[voteid].claimId,allvotes[voteid].verdict,allvotes[voteid].date_submit,allvotes[voteid].tokenRec ,decision ,status);
    }

    function getvoter_vote(uint voteid) constant returns(address voter)
    {
        return allvotes[voteid].voter;
    }

    function getClaim(uint claimid) constant returns( uint claimId,uint coverId,uint date_submit,int vote,uint status,uint date_upd,uint state16Count)
    {
        return(allClaims[claimid].claimId,allClaims[claimid].coverId,allClaims[claimid].date_submit,allClaims[claimid].vote,allClaims[claimid].status,allClaims[claimid].date_upd,allClaims[claimid].state16Count);
    }

  
    function getClaimVoteLength(uint claimid,uint ca) constant returns( uint len)
    {
        if (ca==1)
        return claim_vote_ca[claimid].length;
        else
        return claim_vote_member[claimid].length;
    }
    function getvoteVerdict(uint claimid,uint index,uint ca) constant returns (int ver)
    { if (ca==1)
        return allvotes[claim_vote_ca[claimid][index]].verdict;
        else
         return allvotes[claim_vote_member[claimid][index]].verdict;
    }
    function getvoteToken(uint claimid,uint index,uint ca) constant returns (uint tok)
    { if (ca==1)
        return allvotes[claim_vote_ca[claimid][index]].tokens;
        else
         return allvotes[claim_vote_member[claimid][index]].tokens;
    }
    function getvoteVoter(uint claimid,uint index,uint ca) constant returns (address voter)
    { if (ca==1)
        return allvotes[claim_vote_ca[claimid][index]].voter;
        else
         return allvotes[claim_vote_member[claimid][index]].voter;
    }
    function getUserClaimCount(address _add) constant returns(uint len)
    {
        len = allClaimsByAddress[_add].length;
    }
    
    function getClaimLength() constant returns (uint len)
    {
        len = allClaims.length - pendingClaim_start;    
    }
    function actualClaimLength() constant returns (uint len)
    {
        len = allClaims.length;
    }
    function setpendingClaim_start(uint start) onlyInternal
    {
        if (pendingClaim_start>start) throw;
        pendingClaim_start=start;
    }

    
    function getClaimFromNewStart(uint index,address _add)constant returns(uint coverid , uint claimid , int voteCA , int voteMV , uint statusnumber)
    {
        uint i = pendingClaim_start + index;
        coverid = allClaims[i].coverId;
        claimid = allClaims[i].claimId;
        if(vote_ca[_add][i]>0)
            voteCA = allvotes[vote_ca[_add][i]].verdict;
        else
            voteCA = 0;
            
        if(vote_member[_add][i]>0)
            voteMV = allvotes[vote_member[_add][i]].verdict;
        else
            voteMV = 0;
            
        statusnumber = allClaims[i].status;
    }
    

    
    function getUserClaimByIndex(uint index,address _add)constant returns(uint status , uint coverid , uint claimid)
    {
        uint i = allClaimsByAddress[_add][index];
        status = allClaims[i].status;
        coverid = allClaims[i].coverId;
        claimid = allClaims[i].claimId;
    }
    

   

    function getAllVotesForClaim(uint claimid) constant returns(uint[] ca , uint[] mv)
    {
        return(claim_vote_ca[claimid] , claim_vote_member[claimid]);
    }
    function getTokens_claim(address _of,uint claimid) constant returns(uint tokens)
    {
        return allvotes[vote_ca[_of][claimid]].tokens;
    }

   
    
     
    
   

   
   
    function getClaimStatus(uint claimid) constant returns(uint stat)
    {
        stat=allClaims[claimid].status;
    }
    function getClaimUpdate(uint claimid) constant returns(uint upd)
    {
        upd=allClaims[claimid].date_upd;
    }
    

   
    function getClaimCoverId(uint claimid) constant returns(uint coverid)
    {
        coverid=allClaims[claimid].coverId;
    }
    function getClaimVote(uint claimid,int verdict) constant returns(uint token)
    { 
        token=0;
        for(uint i=0;i<claim_vote_ca[claimid].length;i++)
                {
                    if(allvotes[claim_vote_ca[claimid][i]].verdict==verdict)
                        token+=allvotes[claim_vote_ca[claimid][i]].tokens;
                  
                    
                }
    }
    function getClaimMVote(uint claimid,int verdict) constant returns(uint token)
    {   
        token=0;
        for(uint i=0;i<claim_vote_member[claimid].length;i++)
                {
                    if(allvotes[claim_vote_member[claimid][i]].verdict==verdict)
                        token+=allvotes[claim_vote_member[claimid][i]].tokens;
                  
                    
                }
    }

   
    function changeFinalVerdict(uint claimId , int verdict) onlyInternal
    {
            allClaims[claimId].vote = verdict;
    }
    
    function updateRewardCA(uint claimid ,uint index, uint tokens) onlyInternal
    {
        allvotes[claim_vote_ca[claimid][index]].tokenRec = tokens;
    }
    function updateRewardMV(uint claimid ,uint index, uint tokens) onlyInternal
    {
        allvotes[claim_vote_member[claimid][index]].tokenRec = tokens;
    }
    function getFinalVerdict(uint claimId) constant returns(int verdict)
    {
        verdict = allClaims[claimId].vote;
    }

    function addClaim(uint claimId,uint coverId,uint date_submit,int vote,uint status,uint date_upd,uint state16Count) onlyInternal
    {
        allClaims.push(claim(claimId , coverId , date_submit,vote,status,date_upd,state16Count));
    }

    function addClaim_sender(address _from,uint claimid) onlyInternal
    {allClaimsByAddress[_from].push(claimid);}

    function addClaimStatus(uint claimid,uint status,uint date_upd,uint blockNumber) onlyInternal
    {
        claim_status[claimid].push(claimStatus(status,date_upd,blockNumber));
    }
  function addCover_Claim(uint coverid,uint claimid) onlyInternal{
      cover_claim[coverid].push(claimid);
  }
  function addVote(  address voter,uint tokens,uint claimId,int verdict,uint date_submit,uint tokenRec) onlyInternal
  {
      allvotes.push(vote(voter,tokens,claimId,verdict,date_submit,tokenRec));
  }
    function addclaim_vote_ca(uint claimid,uint voteid) onlyInternal
    {
        claim_vote_ca[claimid].push(voteid);
    }
    function setvote_ca(address _from,uint claimid,uint voteid) onlyInternal
    {
        vote_ca[_from][claimid]=voteid;
    }
    function addvote_address_ca(address _from,uint voteid) onlyInternal
    {
        vote_address_ca[_from].push(voteid);
    }
    function setvote_length(uint len) onlyInternal
    {
        if (len<vote_length) throw;
        vote_length=len;
    }
    function setclaim_tokensCA(uint claimid,int vote,uint tokens) onlyInternal
    {
        if(vote==1)
        claim_tokensCA[claimid].accept += tokens;
        if(vote==-1)
         claim_tokensCA[claimid].deny += tokens;
    }
    function setclaim_tokensMV(uint claimid,int vote,uint tokens) onlyInternal
    {
        if(vote==1)
        claim_tokensMV[claimid].accept += tokens;
        if(vote==-1)
         claim_tokensMV[claimid].deny += tokens;
    }
    function addclaim_vote_member(uint claimid,uint voteid) onlyInternal
    {
        claim_vote_member[claimid].push(voteid);
    }
    function setvote_member(address _from,uint claimid,uint voteid) onlyInternal
    {
        vote_member[_from][claimid]=voteid;
    }
    function addvote_address_member(address _from,uint voteid) onlyInternal
    {
        vote_address_member[_from].push(voteid);
    }
  

    function updatestate16Count(uint claimid,uint cnt) onlyInternal
    {
       
         allClaims[claimid].state16Count +=cnt;
    }
    function setClaimStatus(uint claimid,uint stat) onlyInternal
    {
        allClaims[claimid].status=stat;
    } 
    function setClaimdate_upd(uint claimid,uint _date_upd) onlyInternal
    {
         allClaims[claimid].date_upd = _date_upd;
    }
}