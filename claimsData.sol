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
import "./master.sol";

contract claimsData
{
    master ms1;
    address masterAddress;
    struct claim 
    {
        uint coverId;
        uint date_submit;
        int8 vote;
        uint8 status;
        uint date_upd;
        uint8 state16Count;      
    }
    struct claimStatus
    {
        uint8 status;
        uint date_upd;
        //uint blockNumber;
    }
    struct claim_totalTokens
    {
        uint accept;
        uint deny;
    }
    claim[]  allClaims;
    vote[]  allvotes;
    struct claim_pause {
        uint coverid;
        uint date_upd;
        bool submit;
    }
    claim_pause[] claimPause;
    uint claim_pause_lastsubmit;
    uint public vote_length;
    mapping(uint=>uint[])  cover_claim;
    mapping(uint=>claimStatus[]) public claim_status;   
    mapping(uint=>uint[])  claim_vote_ca;
    mapping(uint=>uint[])  claim_vote_member;
    mapping(address=>mapping(uint=>uint))  vote_ca;
    mapping(address=>mapping(uint=>uint))  vote_member;
    mapping(address=>uint[])  vote_address_ca;
    mapping(address=>uint[])  vote_address_member;
    mapping(address=>uint[])  allClaimsByAddress;
    mapping(uint=>claim_totalTokens) claim_tokensCA;
    mapping(uint=>claim_totalTokens) claim_tokensMV;
    
    uint32 public maxtime;
    uint32 public mintime;
    uint public pendingClaim_start;
    uint32 public payoutRetryTime;
    uint32 public escalationTime;
    struct vote
    {
        address voter;
        uint tokens;
        uint claimId;
        int8 verdict;
        uint date_submit;
        uint tokenRec;
    }
    
    function claimsData()
    {
        escalationTime = 3600;
        pendingClaim_start = 0;
        //claim_length = 0;
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
    /// @dev Sets the Escalation Time of claims.
    function setEscalationTime(uint32 _time) onlyInternal
    {
        escalationTime=_time;
    }
    /// @dev Sets Maximum time(in milliseconds) for which claim assessment voting is open
     function setMaxTime(uint32 _time) onlyInternal
    {
        maxtime=_time;
    }
    /// @dev Sets Minimum time(in milliseconds) for which claim assessment voting is open
    function setMinTime(uint32 _time) onlyInternal
    {
        mintime=_time;
    }
    /// @dev Sets the Retry Time 
    function setPayoutRetryTime(uint32 _time) onlyInternal
    {
        payoutRetryTime=_time;
    }


    /// @dev Gets the Claim's details of given index. 
    function getAllClaimsByIndex(uint index) constant returns(uint coverId,uint date_submit,int8 vote,uint8 status,uint date_upd,uint8 state16Count)
    {
        return(allClaims[index].coverId,allClaims[index].date_submit,allClaims[index].vote,allClaims[index].status,allClaims[index].date_upd,allClaims[index].state16Count);
    }
   /// @dev Gets status details of a claim for a given index.
   function getClaim_status(uint claimid,uint index) constant returns(uint8 status,uint date_upd)
   {
       return(claim_status[claimid][index].status,claim_status[claimid][index].date_upd);
   }
   /// @dev Gets the list of all the claims a given cover has.
   /// @param index Claim id.
   /// @return claims All the claims of a cover.
   function getCover_claim(uint index) constant returns(uint[] claims)
   {
       return cover_claim[index];
   }   
   /// @dev Gets the vote id of a given claim of a given Claim Assessor.
   function getvote_ca(uint claimid,address _ca) constant returns(uint id_vote)
   {
       return vote_ca[_ca][claimid];
   }
   /// @dev Gets the vote id of a given claim of a given member. 
    function getvote_member(uint claimid,address _member) constant returns(uint id_vote)
   {
       return vote_member[_member][claimid];
   }
   /// @dev Gets all the vote indexes of a given Claim Assessor's Address.
   /// @param _ca Claim Assessor's Address.
   /// @return votearr list of all the vote id given by the Claim Assessor.
   function getvote_address_ca(address _ca) constant returns(uint[] votearr)
   {
       return vote_address_ca[_ca];
   }
    /// @dev Gets all the vote indexes of a given Member's Address.
   /// @param _member Member's Address.
   /// @return votearr list of all the vote id given by Member.
   function getvote_address_member(address _member) constant returns(uint[] votearr)
   {
       return vote_address_member[_member];
   }
   /// @dev Gets the status number of a given claim.
   /// @param id Claim id.
   /// @return statno Status Number.
    function getClaimStatusNumber(uint id)constant returns(uint8 statno)
    {
        statno = allClaims[id].status;
    }
    /// @dev Gets the number of Try that has been made for a successful payout of a Claim.
    function getClaimState16Count(uint id)constant returns(uint8 num)
    {
        num = allClaims[id].state16Count;
    }
    /// @dev Gets the last update date of a claim. 
    function getClaimDateUpd(uint id) constant returns(uint dateupd)
    {
        dateupd = allClaims[id].date_upd;
    }
    /// @dev Gets all Claims created by a user till date.
    /// @param _member user's address.
    /// @return claimarr List of claims id.
    function getAllClaimsByAddress(address _member) constant returns(uint[] claimarr)
    {
        return allClaimsByAddress[_member];
    }
    /// @dev Gets the number of tokens that has been locked while giving vote to a claim by  Claim Assessors.
    /// @param claimid Claim Id.
    /// @return accept Total number of tokens when CA accepts the claim. CA gives vote in favor.
    /// @return deny Total number of tokens when CA declines the claim. CA gives vote in against.
    function getClaims_tokenCA(uint claimid) constant returns(uint accept,uint deny)
    {
        return (claim_tokensCA[claimid].accept,claim_tokensCA[claimid].deny);
    }
    /// @dev Gets the number of tokens that has been locked while giving vote to a claim by Members.
    /// @param claimid Claim Id.
    /// @return accept Total number of tokens when member accepts the claim. Member gives vote in favor.
    /// @return deny Total number of tokens when member declines the claim. Member gives vote in against.
     function getClaims_tokenMV(uint claimid) constant returns(uint accept,uint deny)
    {
         return (claim_tokensMV[claimid].accept,claim_tokensMV[claimid].deny);
    }
    /// @dev Gets the total number of tokens of a given Claim ,received during voting period done by Claims Assessors.
    function getCaClaimVotes_token(uint claimid) constant returns(uint cnt)
    {   cnt=0;
        for(uint i=0;i<claim_vote_ca[claimid].length;i++)
        {
            cnt+=allvotes[claim_vote_ca[claimid][i]].tokens;
        }
    }
     /// @dev Gets the total number of tokens of a given Claim ,received during voting period done by Members.
    function getMemberClaimVotes_token(uint claimid) constant returns(uint cnt)
    {   cnt=0;
        for(uint i=0;i<claim_vote_member[claimid].length;i++)
        {
            cnt+=allvotes[claim_vote_member[claimid][i]].tokens;
        }
    }
    /// @dev Gets the user's claim vote details who has participated in voting as a Claim assessor and a Member.
    /// @return cavote list of all the vote id given by the user as a Claim Assessor.
    /// @return mvote list of all the vote id given by the user as a Member.
    function getUserVotes() constant returns(uint[] cavote,uint []mvote)
    {
        return(vote_address_ca[msg.sender],vote_address_member[msg.sender]);
        
        
    }
    /// @dev Provides information of a vote when given its vote id.
    /// @param voteid Vote Id.
    function getVoteDetails(uint voteid) constant returns(uint tokens,uint claimId,int8 verdict, uint date_submit,uint tokenRec,int8 claimVerdict,uint8 status)
    {
        int8 decision = allClaims[allvotes[voteid].claimId].vote;
        status= allClaims[allvotes[voteid].claimId].status;
        return (allvotes[voteid].tokens,allvotes[voteid].claimId,allvotes[voteid].verdict,allvotes[voteid].date_submit,allvotes[voteid].tokenRec ,decision ,status);
    }
    /// @dev Gets the voter's address of a given vote id.
    function getvoter_vote(uint voteid) constant returns(address voter)
    {
        return allvotes[voteid].voter;
    }
    /// @dev Provides information of a Claim when given its claim id.
    /// @param claimid Claim Id.
    function getClaim(uint claimid) constant returns(uint coverId,uint date_submit,int8 vote,uint8 status,uint date_upd,uint8 state16Count)
    {
        return(allClaims[claimid].coverId,allClaims[claimid].date_submit,allClaims[claimid].vote,allClaims[claimid].status,allClaims[claimid].date_upd,allClaims[claimid].state16Count);
    }

    /// @dev Gets the total number of votes of a given claim.
    /// @param claimid Claim Id.
    /// @param ca if 1: returns the number of votes given by Claim Assessors to a claim, else returns the number of votes of given by Members to a claim.
    /// @return len total number of votes of a given claim.
    function getClaimVoteLength(uint claimid,uint8 ca) constant returns(uint len)
    {
        if (ca==1)
        return claim_vote_ca[claimid].length;
        else
        return claim_vote_member[claimid].length;
    }
    /// @dev Gets the verdict of a vote using claim id and index.
    /// @param ca 1 for vote given as a CA, else for vote given as a member.
    /// @return ver 1 if vote was given in favour,-1 if given in against.
    function getvoteVerdict(uint claimid,uint index,uint8 ca) constant returns (int8 ver)
    { if (ca==1)
        return allvotes[claim_vote_ca[claimid][index]].verdict;
        else
         return allvotes[claim_vote_member[claimid][index]].verdict;
    }
    /// @dev Gets the Number of tokens of a vote using claim id and index.
    /// @param ca 1 for vote given as a CA, else for vote given as a member.
    /// @return tok Number of tokens.
    function getvoteToken(uint claimid,uint index,uint8 ca) constant returns (uint tok)
    { if (ca==1)
        return allvotes[claim_vote_ca[claimid][index]].tokens;
        else
         return allvotes[claim_vote_member[claimid][index]].tokens;
    }
    /// @dev Gets the Voter's address of a vote using claim id and index.
    /// @param ca 1 for vote given as a CA, else for vote given as a member.
    /// @return voter Voter's address.
    function getvoteVoter(uint claimid,uint index,uint8 ca) constant returns (address voter)
    { if (ca==1)
        return allvotes[claim_vote_ca[claimid][index]].voter;
        else
         return allvotes[claim_vote_member[claimid][index]].voter;
    }
    /// @dev Gets total number of claims created by a user till date.
    /// @param _add User's address.
    function getUserClaimCount(address _add) constant returns(uint len)
    {
        len = allClaimsByAddress[_add].length;
    }
    /// @dev Calculates number of claims that are in pending state.
    function getClaimLength() constant returns (uint len)
    {
        len = allClaims.length - pendingClaim_start;    
    }
    /// @dev Gets the Number of all the Claims created till date.
    function actualClaimLength() constant returns (uint len)
    {
        len = allClaims.length;
    }
    /// @dev Updates the pending claim start variable, which is the lowest claim id with a pending decision/payout.
    function setpendingClaim_start(uint start) onlyInternal
    {
        if (pendingClaim_start>start) throw;
        pendingClaim_start=start;
    }

    /// @dev Gets details of a claim.
    /// @param index claim id=pending claim start + given index
    /// @param _add User's address.
    /// @return coverid cover against which claim has been submitted.
    /// @return claimid Claim  Id.
    /// @return voteCA verdict of vote given as a Claim Assessor.1 for accept,-1 for deny,0 if vote is not given for claim.
    /// @return voteMV verdict of vote given as a Member.1 for accept,-1 for deny,0 if vote i not given for claim.
    /// @return statusnumber Status of claim.
    function getClaimFromNewStart(uint index,address _add)constant returns(uint coverid , uint claimid , int8 voteCA , int8 voteMV , uint8 statusnumber)
    {
        uint i = pendingClaim_start + index;
        coverid = allClaims[i].coverId;
        claimid = i;
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
    /// @dev Gets details of a claim of a user at a given index.
    function getUserClaimByIndex(uint index,address _add)constant returns(uint8 status , uint coverid , uint claimid)
    {
        claimid = allClaimsByAddress[_add][index];
        status = allClaims[claimid].status;
        coverid = allClaims[claimid].coverId;
    }
    /// @dev Gets Id of all the votes given to a claim.
    /// @param claimid Claim Id.
    /// @return ca id of all the votes given by Claim assessors to a claim.
    /// @return mv id of all the votes given by members to a claim.
    function getAllVotesForClaim(uint claimid) constant returns(uint[] ca , uint[] mv)
    {
        return(claim_vote_ca[claimid] , claim_vote_member[claimid]);
    }
    /// @dev Gets Number of tokens deposit in a vote using Claim assessor's address and claim id.
    /// @return tokens Number of deposited tokens.
    function getTokens_claim(address _of,uint claimid) constant returns(uint tokens)
    {
        return allvotes[vote_ca[_of][claimid]].tokens;
    }
    /// @dev Gets Status number of a claim.
    function getClaimStatus(uint claimid) constant returns(uint8 stat)
    {
        stat=allClaims[claimid].status;
    }
    /// @dev Gets last timestamp at which claim has been updated.
    function getClaimUpdate(uint claimid) constant returns(uint upd)
    {
        upd=allClaims[claimid].date_upd;
    }
    /// @dev Gets cover id of a claim.
    function getClaimCoverId(uint claimid) constant returns(uint coverid)
    {
        coverid=allClaims[claimid].coverId;
    }
    /// @dev Gets total number of tokens of a claim given to it during voting by Claim Assessors.
    /// @param claimid Claim Id.
    /// @param verdict 1 to get total number of accept tokens, -1 to get total number of deny tokens.
    /// @return token token Number of tokens(either accept or deny on the basis of verdict given as parameter).
    function getClaimVote(uint claimid,int8 verdict) constant returns(uint token)
    { 
        token=0;
        for(uint i=0;i<claim_vote_ca[claimid].length;i++)
        {
            if(allvotes[claim_vote_ca[claimid][i]].verdict==verdict)
            token+=allvotes[claim_vote_ca[claimid][i]].tokens;
        }
    }
    /// @dev Gets total number of tokens of a claim given to it during voting by Members.
    /// @param claimid Claim Id.
    /// @param verdict 1 to get total number of accept tokens, -1 to get total number of deny tokens.
    /// @return token token Number of tokens(either accept or deny on the basis of verdict given as parameter).
    function getClaimMVote(uint claimid,int8 verdict) constant returns(uint token)
    {   
        token=0;
        for(uint i=0;i<claim_vote_member[claimid].length;i++)
        {
            if(allvotes[claim_vote_member[claimid][i]].verdict==verdict)
            token+=allvotes[claim_vote_member[claimid][i]].tokens;
        }
    }

   /// @dev Sets the final vote's result(either accepted or declined)of a claim.
   /// @param claimId Claim Id.
   /// @param verdict 1 if claim is accepted,-1 if declined.
    function changeFinalVerdict(uint claimId , int8 verdict) onlyInternal
    {
            allClaims[claimId].vote = verdict;
    }
    /// @dev Sets the Reward tokens to a vote given by Claim Assessors after voting period of a claim is over.
    /// @param claimid Claim Id.
    /// @param index index.
    /// @param tokens Number of tokens rewarded.
    function updateRewardCA(uint claimid ,uint index, uint tokens) onlyInternal
    {
        allvotes[claim_vote_ca[claimid][index]].tokenRec = tokens;
    }
    /// @dev Sets the Reward tokens to a vote given by Members after voting period of a claim is over.
    /// @param claimid Claim Id.
    /// @param index index of vote against claimid.
    /// @param tokens Number of tokens to be rewarded. 
    function updateRewardMV(uint claimid ,uint index, uint tokens) onlyInternal
    {
        allvotes[claim_vote_member[claimid][index]].tokenRec = tokens;
    }
    /// @dev Gets the Final result of voting of a claim.
    /// @param claimId Claim id.
    /// @return verdict 1 if claim is accepted, -1 if declined.
    function getFinalVerdict(uint claimId) constant returns(int8 verdict)
    {
        verdict = allClaims[claimId].vote;
    }

    function addClaim(uint claimId,uint coverId,address _from,uint time) onlyInternal
    {
        allClaims.push(claim(coverId,time,0,0,time,0));
        allClaimsByAddress[_from].push(claimId);
        claim_status[claimId].push(claimStatus(0,time));
        cover_claim[coverId].push(claimId);
    }

    /// @dev Stores a given claim id in a given address. Maintains the record of all the claims created/submitted by a given user.
    /// @param _from address of a user.
    /// @param claimid Claim id which will be stored.
    function addClaim_sender(address _from,uint claimid) onlyInternal
    {allClaimsByAddress[_from].push(claimid);}

    /// @dev Stores the status details of an existing claim. Maintains the record of all the status a claim has gone through.
    function addClaimStatus(uint claimid,uint8 status,uint date_upd) onlyInternal
    {
        claim_status[claimid].push(claimStatus(status,date_upd));
    }
    /// @dev Stores a given claim id in a given cover. Maintains the record of all the claims submitted for a cover.
    /// @param coverid Cover Id.
    /// @param claimid Claim Id.
    function addCover_Claim(uint coverid,uint claimid) onlyInternal
    {
      cover_claim[coverid].push(claimid);
    }
    /// @dev Add Vote's details of a given claim.
     function addVote(address voter,uint tokens,uint claimId,int8 verdict,uint date_submit,uint tokenRec) onlyInternal
    {
      allvotes.push(vote(voter,tokens,claimId,verdict,date_submit,tokenRec));
    }
    /// @dev Stores the id of the vote given to a claim.Maintains record of all votes given by all the CA to a claim.
    /// @param claimid Claim Id to which vote has given by the CA.
    /// @param voteid Vote Id. 
    function addclaim_vote_ca(uint claimid,uint voteid) onlyInternal
    {
        claim_vote_ca[claimid].push(voteid);
    }
    /// @dev Sets the id of the vote.
    /// @param _from Claim assessor's address who has given the vote.
    /// @param claimid Claim Id for which vote has been given by the CA.
    /// @param voteid Vote Id which will be stored against the given _from and claimid.
    function setvote_ca(address _from,uint claimid,uint voteid) onlyInternal
    {
        vote_ca[_from][claimid]=voteid;
    }
    /// @dev Stores the id of the vote given by a Claim Assessor.Maintains record of all the votes given by a user as a Claim assessor.
    /// @param _from Claim Assessor Address.
    /// @param voteid Vote Id. 
    function addvote_address_ca(address _from,uint voteid) onlyInternal
    {
        vote_address_ca[_from].push(voteid);
    }
    /// @dev Sets a new length.
    function setvote_length(uint len) onlyInternal
    {
        if (len<vote_length) throw;
        vote_length=len;
    }
    /// @dev Stores the tokens given by the Claim Assessors during voting of a given claim.
    /// @param claimid Claim Id.
    /// @param vote 1 for accept and increases the tokens of claim as accept, -1 for deny and increases the tokens of claim as deny.
    /// @param tokens Number of tokens.
    function setclaim_tokensCA(uint claimid,int8 vote,uint tokens) onlyInternal
    {
        if(vote==1)
        claim_tokensCA[claimid].accept += tokens;
        if(vote==-1)
         claim_tokensCA[claimid].deny += tokens;
    }
    /// @dev Stores the tokens given by the Members during voting of a given claim.
    /// @param claimid Claim Id.
    /// @param vote 1 for accept and increases the tokens of claim as accept, -1 for deny and increases the tokens of claim as deny.
    /// @param tokens Number of tokens.
    function setclaim_tokensMV(uint claimid,int8 vote,uint tokens) onlyInternal
    {
        if(vote==1)
        claim_tokensMV[claimid].accept += tokens;
        if(vote==-1)
         claim_tokensMV[claimid].deny += tokens;
    }
     /// @dev Stores the id of the vote given to a claim.Maintains record of all votes given by all the Members to a claim.
    /// @param claimid Claim Id to which vote has been given by the Member.
    /// @param voteid Vote Id.
    function addclaim_vote_member(uint claimid,uint voteid) onlyInternal
    {
        claim_vote_member[claimid].push(voteid);
    }
     /// @dev Sets the id of the vote.
    /// @param _from Member's address who has given the vote.
    /// @param claimid Claim Id for which vote has been given by the Member.
    /// @param voteid Vote Id which will be stored against the given _from and claimid.
    function setvote_member(address _from,uint claimid,uint voteid) onlyInternal
    {
        vote_member[_from][claimid]=voteid;
    }
    /// @dev Stores the id of the vote given by a Member.Maintains record of all the votes given by a user as a Member.
    /// @param _from Member's Address.
    /// @param voteid Vote Id. 
    function addvote_address_member(address _from,uint voteid) onlyInternal
    {
        vote_address_member[_from].push(voteid);
    }
    /// @dev Increases the count of failure until payout of a claim is succeeded.
    function updatestate16Count(uint claimid,uint8 cnt) onlyInternal
    {
         allClaims[claimid].state16Count +=cnt;
    }
    /// @dev Sets status of a claim.
    /// @param claimid Claim Id.
    /// @param stat Status number.
    function setClaimStatus(uint claimid,uint8 stat) onlyInternal
    {
        allClaims[claimid].status=stat;
    } 
    /// @dev Sets the date of a given claim at which the Claim's details has been updated/changed.
    /// @param claimid Claim Id of claim which has been changed.
    /// @param _date_upd timestamp at which claim is updated.
    function setClaimdate_upd(uint claimid,uint _date_upd) onlyInternal
    {
         allClaims[claimid].date_upd = _date_upd;
    }

    function setClaimAtEmergencyPause (uint coverId,uint date_upd, bool submit) onlyInternal {
        claimPause.push(claim_pause(coverId,date_upd,submit));
        
    }

    function getClaimOfEmergencyPauseByIndex (uint indx) constant returns(uint coverId, uint date_upd, bool submit) {
        coverId = claimPause[indx].coverid;
        date_upd= claimPause[indx].date_upd;
        submit  = claimPause[indx].submit;
    }

    function setClaimSubmittedAtEPTrue (uint indx,bool submit) onlyInternal {
        claimPause[indx].submit=submit;
    }

    function getLengthOfClaimSubmittedAtEP () constant returns(uint len) {
        len=claimPause.length;
    }
    
    function setFirstClaimIndexToSubmitAfterEP (uint FirstClaimIndexToSubmit) onlyInternal {
        claim_pause_lastsubmit=FirstClaimIndexToSubmit;
    }
    function getFirstClaimIndexToSubmitAfterEP () constant returns(uint FirstClaimIndexToSubmit) {
        FirstClaimIndexToSubmit = claim_pause_lastsubmit;
    }
}