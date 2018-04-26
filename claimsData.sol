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

pragma solidity ^0.4.11;
import "./master.sol";
import "./SafeMaths.sol";
contract claimsData
{
    using SafeMaths for uint;
    master ms;
    address masterAddress;
    struct claim 
    {
        uint coverId;
        // uint date_submit;
        // bool vote;
        // uint8 status;
        uint date_upd;
        // uint8 state16Count;      
    }
    mapping(uint=>int8) claim_Vote;
    mapping(uint=>uint8) claim_Status;
    mapping(uint=>uint8) claim_State16Count;
    
    struct vote
    {
        address voter;
        uint tokens;
        // uint claimId;
        int8 verdict;
        // uint date_submit;
        // uint tokenRec;
    }
    struct claimStatus
    {
        uint8 status;
        uint date_upd;
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
    
    struct claimPauseVoting {
        uint claimid;
        uint pendingTime;
        bool voting;
    }
    claimPauseVoting[] claimPauseVotingEP;
    uint claimStartVoting_firstIndex;
    
    event Claim(uint indexed coverId, address indexed userAddress, uint claimId, uint date_submit);
    event Votes(address indexed userAddress, uint indexed claimId, bytes4 indexed typeOf, uint tokens, uint submitDate, int8 verdict);
    
    // uint public vote_length;
    // mapping(uint=>uint[])  cover_claim;
    // mapping(uint=>claimStatus[]) public claim_status;   
    mapping(uint=>uint[])  claim_vote_ca;
    mapping(uint=>uint[])  claim_vote_member;
    mapping(address=>mapping(uint=>uint))  user_claim_voteCA;
    mapping(address=>mapping(uint=>uint))  user_claim_voteMember;
    // mapping(address=>uint[])  vote_address_ca;
    // mapping(address=>uint[])  vote_address_member;
    mapping(address=>uint[]) allClaimsByAddress;
    mapping(uint=>claim_totalTokens) claim_tokensCA;
    mapping(uint=>claim_totalTokens) claim_tokensMV;
    
    uint32 public max_voting_time;
    uint32 public min_voting_time;
    uint public pendingClaim_start;
    uint32 public payoutRetryTime;
    uint32 public escalationTime;
    uint public claimDepositTime;

    
    function claimsData()
    {
        escalationTime = 3600;
        pendingClaim_start = 0;
    
        max_voting_time = 1800;
        min_voting_time=1200;
        payoutRetryTime=SafeMaths.mul32(SafeMaths.mul32(24,60),60);
        allvotes.push(vote(0,0,0));
        // vote_length = 1;
        claimDepositTime=SafeMaths.mul(1,7 days);
    }
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000){
            masterAddress = _add;
            ms=master(masterAddress);
        }
        else
        {
            ms=master(masterAddress);
            if(ms.isInternal(msg.sender) == true)
                masterAddress = _add;
            else
                throw;
        }
    }
    modifier onlyOwner{
        // ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == true);
        _; 
    }
    modifier onlyInternal {
        // ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == true);
        _; 
    }
    /// @dev Sets the Escalation Time of claims.
    function setEscalationTime(uint32 _time) onlyInternal
    {
        escalationTime=_time;
    }
    /// @dev Sets Maximum time(in milliseconds) for which claim assessment voting is open
     function setMax_voting_time(uint32 _time) onlyInternal
    {
        max_voting_time=_time;
    }
    /// @dev Sets Minimum time(in milliseconds) for which claim assessment voting is open
    function setMin_voting_time(uint32 _time) onlyInternal
    {
        min_voting_time=_time;
    }
    /// @dev Sets the Retry Time 
    function setPayoutRetryTime(uint32 _time) onlyInternal
    {
        payoutRetryTime=_time;
    }

    /// @dev Gets the Claim's details of given claimid. 
    function getAllClaimsByIndex(uint _claimId) constant returns(uint coverId,int8 vote,uint8 status,uint date_upd,uint8 state16Count)
    {
        return(allClaims[_claimId].coverId,claim_Vote[_claimId],claim_Status[_claimId],allClaims[_claimId].date_upd,claim_State16Count[_claimId]);
    }
    // /// @dev Gets status details of a claim for a given index.
    // function getClaim_status(uint _claimId, uint _index) constant returns(uint8 status, uint date_upd)
    // {
    //     return(claim_status[_claimId][_index].status,claim_status[_claimId][_index].date_upd);
    // }
    // /// @dev Gets the list of all the claims a given cover has.
    // /// @param _coverid Cover Id.
    // /// @return claims All the claims of a cover.
    // function getCover_claim(uint _coverid) constant returns(uint[] claims)
    // {
    //     return cover_claim[_coverid];
    // }
    /// @dev Gets the vote id of a given claim of a given Claim Assessor.
    function getUser_Claim_VoteCA(address _add,uint _claimId) constant returns(uint id_vote)
    {
        return user_claim_voteCA[_add][_claimId];
    }
    /// @dev Gets the vote id of a given claim of a given member. 
    function getUser_Claim_VoteMember(address _add,uint _claimId) constant returns(uint id_vote)
    {
        return user_claim_voteMember[_add][_claimId];
    }
    function getAllVoteLength() constant returns(uint voteCount)
    {
        return SafeMaths.sub(allvotes.length,1); //Start Index always from 1.
    } 

    /// @dev Gets the status number of a given claim.
    /// @param _claimId Claim id.
    /// @return statno Status Number.
    function getClaimStatusNumber(uint _claimId)constant returns(uint claimId, uint8 statno)
    {
        return(_claimId, claim_Status[_claimId]);
    }
    /// @dev Gets the number of Try that has been made for a successful payout of a Claim.
    function getClaimState16Count(uint _claimId)constant returns(uint8 num)
    {
        num = claim_State16Count[_claimId];
    }
    /// @dev Gets the last update date of a claim. 
    function getClaimDateUpd(uint _claimId) constant returns(uint dateupd)
    {
        dateupd = allClaims[_claimId].date_upd;
    }
    /// @dev Gets all Claims created by a user till date.
    /// @param _member user's address.
    /// @return claimarr List of claims id.
    function getAllClaimsByAddress(address _member) constant returns(uint[] claimarr)
    {
        return allClaimsByAddress[_member];
    }
    /// @dev Gets the number of tokens that has been locked while giving vote to a claim by  Claim Assessors.
    /// @param _claimId Claim Id.
    /// @return accept Total number of tokens when CA accepts the claim. CA gives vote in favor.
    /// @return deny Total number of tokens when CA declines the claim. CA gives vote in against.
    function getClaims_tokenCA(uint _claimId) constant returns(uint claimId, uint accept,uint deny)
    {
        return (_claimId,claim_tokensCA[_claimId].accept,claim_tokensCA[_claimId].deny);
    }
    /// @dev Gets the number of tokens that has been locked while giving vote to a claim by Members.
    /// @param _claimId Claim Id.
    /// @return accept Total number of tokens when member accepts the claim. Member gives vote in favor.
    /// @return deny Total number of tokens when member declines the claim. Member gives vote in against.
    function getClaims_tokenMV(uint _claimId) constant returns(uint claimId, uint accept, uint deny)
    {
        return (_claimId,claim_tokensMV[_claimId].accept,claim_tokensMV[_claimId].deny);
    }
    /// @dev Gets the total number of tokens of a given Claim ,received during voting period done by Claims Assessors.
    function getCaClaimVotes_token(uint _claimId) constant returns(uint claimId, uint cnt)
    {
        claimId=_claimId;
        cnt=0;
        for(uint i=0;i<claim_vote_ca[_claimId].length;i++)
        {
            cnt=SafeMaths.add(cnt,allvotes[claim_vote_ca[_claimId][i]].tokens);
        }
    }
    /// @dev Gets the total number of tokens of a given Claim ,received during voting period done by Members.
    function getMemberClaimVotes_token(uint _claimId) constant returns(uint claimId, uint cnt)
    {
        claimId=_claimId;
        cnt=0;
        for(uint i=0;i<claim_vote_member[_claimId].length;i++)
        {
           cnt=SafeMaths.add(cnt,allvotes[claim_vote_member[_claimId][i]].tokens);
        }
    }

    // /// @dev Provides information of a vote when given its vote id.
    // /// @param _voteid Vote Id.
    // function getVoteDetails(uint _voteid) constant returns(uint tokens,uint claimId,int8 verdict, uint date_submit,uint tokenRec,int8 claimVerdict,uint8 status)
    // {
    //     int8 decision = allClaims[allvotes[_voteid].claimId].vote;
    //     status= allClaims[allvotes[_voteid].claimId].status;
    //     return (allvotes[_voteid].tokens,allvotes[_voteid].claimId,allvotes[_voteid].verdict,allvotes[_voteid].date_submit,allvotes[_voteid].tokenRec ,decision ,status);
    // }
    /// @dev Gets the voter's address of a given vote id.
    function getVoter_Vote(uint _voteid) constant returns(address voter)
    {
        return allvotes[_voteid].voter;
    }
    /// @dev Provides information of a Claim when given its claim id.
    /// @param _claimId Claim Id.
    function getClaim(uint _claimId) constant returns(uint claimId, uint coverId,int8 vote,uint8 status,uint date_upd,uint8 state16Count)
    {
        return(_claimId,allClaims[_claimId].coverId,claim_Vote[_claimId],claim_Status[_claimId],allClaims[_claimId].date_upd,claim_State16Count[_claimId]);
    }

    /// @dev Gets the total number of votes of a given claim.
    /// @param _claimId Claim Id.
    /// @param _ca if 1: returns the number of votes given by Claim Assessors to a claim, else returns the number of votes of given by Members to a claim.
    /// @return len total number of votes of a given claim.
    function getClaimVoteLength(uint _claimId,uint8 _ca) constant returns(uint claimId, uint len)
    {
        claimId=_claimId;
        if (_ca==1)
            len= claim_vote_ca[_claimId].length;
        else
            len= claim_vote_member[_claimId].length;
    }
    /// @dev Gets the verdict of a vote using claim id and index.
    /// @param _ca 1 for vote given as a CA, else for vote given as a member.
    /// @return ver 1 if vote was given in favour,-1 if given in against.
    function getVoteVerdict(uint _claimId,uint _index,uint8 _ca) constant returns (int8 ver)
    {
        if (_ca==1)
            ver= allvotes[claim_vote_ca[_claimId][_index]].verdict;
        else
            ver= allvotes[claim_vote_member[_claimId][_index]].verdict;
    }
    /// @dev Gets the Number of tokens of a vote using claim id and index.
    /// @param _ca 1 for vote given as a CA, else for vote given as a member.
    /// @return tok Number of tokens.
    function getVoteToken(uint _claimId,uint _index,uint8 _ca) constant returns (uint tok)
    {
        if (_ca==1)
            tok= allvotes[claim_vote_ca[_claimId][_index]].tokens;
        else
            tok= allvotes[claim_vote_member[_claimId][_index]].tokens;
    }
    /// @dev Gets the Voter's address of a vote using claim id and index.
    /// @param _ca 1 for vote given as a CA, else for vote given as a member.
    /// @return voter Voter's address.
    function getVoteVoter(uint _claimId,uint _index,uint8 _ca) constant returns (address voter)
    { 
        if (_ca==1)
            voter= allvotes[claim_vote_ca[_claimId][_index]].voter;
        else
            voter= allvotes[claim_vote_member[_claimId][_index]].voter;
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
        len = SafeMaths.sub(allClaims.length , pendingClaim_start);    
    }
    /// @dev Gets the Number of all the Claims created till date.
    function actualClaimLength() constant returns (uint len)
    {
        len = allClaims.length;
    }
    /// @dev Updates the pending claim start variable, which is the lowest claim id with a pending decision/payout.
    function setpendingClaim_start(uint _start) onlyInternal
    {
        if (pendingClaim_start>_start) throw;
        pendingClaim_start=_start;
    }

    /// @dev Gets details of a claim.
    /// @param _index claim id=pending claim start + given index
    /// @param _add User's address.
    /// @return coverid cover against which claim has been submitted.
    /// @return claimId Claim  Id.
    /// @return voteCA verdict of vote given as a Claim Assessor.1 for accept,-1 for deny,0 if vote is not given for claim.
    /// @return voteMV verdict of vote given as a Member.1 for accept,-1 for deny,0 if vote i not given for claim.
    /// @return statusnumber Status of claim.
    function getClaimFromNewStart(uint _index,address _add)constant returns(uint coverid , uint claimId , int8 voteCA , int8 voteMV , uint8 statusnumber)
    {
        uint i = SafeMaths.add(pendingClaim_start , _index);
        coverid = allClaims[i].coverId;
        claimId = i;
        if(user_claim_voteCA[_add][i]>0)
            voteCA = allvotes[user_claim_voteCA[_add][i]].verdict;
        else
            voteCA = 0;
            
        if(user_claim_voteMember[_add][i]>0)
            voteMV = allvotes[user_claim_voteMember[_add][i]].verdict;
        else
            voteMV = 0;
            
        statusnumber = claim_Status[i];
    }
    /// @dev Gets details of a claim of a user at a given index.
    function getUserClaimByIndex(uint _index,address _add)constant returns(uint8 status, uint coverid, uint claimId)
    {
        claimId = allClaimsByAddress[_add][_index];
        status = claim_Status[claimId];
        coverid = allClaims[claimId].coverId;
    }
    /// @dev Gets Id of all the votes given to a claim.
    /// @param _claimId Claim Id.
    /// @return ca id of all the votes given by Claim assessors to a claim.
    /// @return mv id of all the votes given by members to a claim.
    function getAllVotesForClaim(uint _claimId) constant returns(uint claimId, uint[] ca , uint[] mv)
    {
        return(_claimId,claim_vote_ca[_claimId], claim_vote_member[_claimId]);
    }
    /// @dev Gets Number of tokens deposit in a vote using Claim assessor's address and claim id.
    /// @return tokens Number of deposited tokens.
    function getTokens_claim(address _of,uint _claimId) constant returns(uint claimId, uint tokens)
    {
        return (_claimId,allvotes[user_claim_voteCA[_of][_claimId]].tokens);
    }
    
    /// @dev Gets last timestamp at which claim has been updated.
    function setClaimDateUpd(uint _claimId, uint _time) onlyInternal
    {
        allClaims[_claimId].date_upd = _time;
    }
    /// @dev Gets cover id of a claim.
    function getClaimCoverId(uint _claimId) constant returns(uint claimId, uint coverid)
    {
        return (_claimId, allClaims[_claimId].coverId);
    }
    
    /// @dev Gets total number of tokens of a claim given to it during voting by Claim Assessors.
    /// @param _claimId Claim Id.
    /// @param _verdict 1 to get total number of accept tokens, -1 to get total number of deny tokens.
    /// @return token token Number of tokens(either accept or deny on the basis of verdict given as parameter).
    function getClaimVote(uint _claimId,int8 _verdict) constant returns(uint claimId, uint token)
    {
        claimId=_claimId;
        token=0;
        for(uint i=0;i<claim_vote_ca[_claimId].length;i++)
        {
            if(allvotes[claim_vote_ca[_claimId][i]].verdict==_verdict)
            token=SafeMaths.add(token,allvotes[claim_vote_ca[_claimId][i]].tokens);
        }
    }
    
    /// @dev Gets total number of tokens of a claim given to it during voting by Members.
    /// @param _claimId Claim Id.
    /// @param _verdict 1 to get total number of accept tokens, -1 to get total number of deny tokens.
    /// @return token token Number of tokens(either accept or deny on the basis of verdict given as parameter).
    function getClaimMVote(uint _claimId,int8 _verdict) constant returns(uint claimId, uint token)
    {   
        claimId=_claimId;
        token=0;
        for(uint i=0;i<claim_vote_member[_claimId].length;i++)
        {
            if(allvotes[claim_vote_member[_claimId][i]].verdict==_verdict)
            token=SafeMaths.add(token,allvotes[claim_vote_member[_claimId][i]].tokens);
        }
    }

    /// @dev Sets the final vote's result(either accepted or declined)of a claim.
    /// @param _claimId Claim Id.
    /// @param _verdict 1 if claim is accepted,-1 if declined.
    function changeFinalVerdict(uint _claimId , int8 _verdict) onlyInternal
    {
        claim_Vote[_claimId] = _verdict;
    }
    // /// @dev Sets the Reward tokens to a vote given by Claim Assessors after voting period of a claim is over.
    // /// @param _claimId Claim Id.
    // /// @param _index index.
    // /// @param _tokens Number of tokens rewarded.
    // function updateRewardCA(uint _claimId ,uint _index, uint _tokens) onlyInternal
    // {
    //     allvotes[claim_vote_ca[_claimId][_index]].tokenRec = _tokens;
    // }
    // /// @dev Sets the Reward tokens to a vote given by Members after voting period of a claim is over.
    // /// @param _claimId Claim Id.
    // /// @param _index index of vote against claimid.
    // /// @param _tokens Number of tokens to be rewarded. 
    // function updateRewardMV(uint _claimId ,uint _index, uint _tokens) onlyInternal
    // {
    //     allvotes[claim_vote_member[_claimId][_index]].tokenRec = _tokens;
    // }
    function changeVerdictOfMV(uint _claimId,uint _index,int8 _verdict) onlyInternal
    {
        allvotes[claim_vote_member[_claimId][_index]].verdict = _verdict;
    }
    function changeVerdictOfCAV(uint _claimId,uint _index,int8 _verdict) onlyInternal
    {
        allvotes[claim_vote_ca[_claimId][_index]].verdict = _verdict;
    }
    
    /// @dev Gets the Final result of voting of a claim.
    /// @param _claimId Claim id.
    /// @return verdict 1 if claim is accepted, -1 if declined.
    function getFinalVerdict(uint _claimId) constant returns(int8 verdict)
    {
        return claim_Vote[_claimId];
    }
    /// @dev Saves the claim submission time in case of emergency pause.
    function addClaim(uint _claimId,uint _coverId,address _from,uint _nowtime) onlyInternal
    {
        allClaims.push(claim(_coverId,_nowtime));
        allClaimsByAddress[_from].push(_claimId);
        // claim_status[_claimId].push(claimStatus(0,_nowtime));
        // cover_claim[_coverId].push(_claimId);
    }

    /// @dev Stores a given claim id in a given address. Maintains the record of all the claims created/submitted by a given user.
    /// @param _from address of a user.
    /// @param _claimId Claim id which will be stored.
    function addClaim_sender(address _from,uint _claimId) onlyInternal
    {
        allClaimsByAddress[_from].push(_claimId);
    }

    // /// @dev Stores the status details of an existing claim. Maintains the record of all the status a claim has gone through.
    // function addClaimStatus(uint _claimId,uint8 _status,uint _date_upd) onlyInternal
    // {
    //     claim_status[_claimId].push(claimStatus(_status,_date_upd));
    // }
    // function getLengthOfClaimStatus(uint _claimId)constant returns(uint,uint)
    // {
    //     return (_claimId,claim_status[_claimId].length);
    // }
    
    // /// @dev Stores a given claim id in a given cover. Maintains the record of all the claims submitted for a cover.
    // /// @param _coverid Cover Id.
    // /// @param _claimid Claim Id.
    // function addCover_Claim(uint _coverid,uint _claimid) onlyInternal
    // {
    //     cover_claim[_coverid].push(_claimid);
    // }
    /// @dev Add Vote's details of a given claim.
    function addVote(address _voter,uint _tokens,int8 _verdict) onlyInternal
    {
       allvotes.push(vote(_voter,_tokens,_verdict));
    }
    /// @dev Stores the id of the vote given to a claim.Maintains record of all votes given by all the CA to a claim.
    /// @param _claimId Claim Id to which vote has given by the CA.
    /// @param _voteid Vote Id. 
    function addClaim_Vote_ca(uint _claimId,uint _voteid) onlyInternal
    {
        claim_vote_ca[_claimId].push(_voteid);
    }
    /// @dev Sets the id of the vote.
    /// @param _from Claim assessor's address who has given the vote.
    /// @param _claimId Claim Id for which vote has been given by the CA.
    /// @param _voteid Vote Id which will be stored against the given _from and claimid.
    function setUser_Claim_VoteCA(address _from,uint _claimId,uint _voteid) onlyInternal
    {
        user_claim_voteCA[_from][_claimId]=_voteid;
    }

    /// @dev Stores the tokens given by the Claim Assessors during voting of a given claim.
    /// @param _claimId Claim Id.
    /// @param _vote 1 for accept and increases the tokens of claim as accept, -1 for deny and increases the tokens of claim as deny.
    /// @param _tokens Number of tokens.
    function setClaim_tokensCA(uint _claimId,int8 _vote,uint _tokens) onlyInternal
    {
        if(_vote==1)
            claim_tokensCA[_claimId].accept =SafeMaths.add(claim_tokensCA[_claimId].accept,_tokens);
        if(_vote==-1)
            claim_tokensCA[_claimId].deny = SafeMaths.add(claim_tokensCA[_claimId].deny,_tokens);
    }
    /// @dev Stores the tokens given by the Members during voting of a given claim.
    /// @param _claimId Claim Id.
    /// @param _vote 1 for accept and increases the tokens of claim as accept, -1 for deny and increases the tokens of claim as deny.
    /// @param _tokens Number of tokens.
    function setClaim_tokensMV(uint _claimId,int8 _vote,uint _tokens) onlyInternal
    {
        if(_vote==1)
            claim_tokensMV[_claimId].accept = SafeMaths.add(claim_tokensMV[_claimId].accept,_tokens);
        if(_vote==-1)
            claim_tokensMV[_claimId].deny = SafeMaths.add(claim_tokensMV[_claimId].deny,_tokens);
    }
    /// @dev Stores the id of the vote given to a claim.Maintains record of all votes given by all the Members to a claim.
    /// @param _claimId Claim Id to which vote has been given by the Member.
    /// @param _voteid Vote Id.
    function addClaim_vote_member(uint _claimId,uint _voteid) onlyInternal
    {
        claim_vote_member[_claimId].push(_voteid);
    }
    /// @dev Sets the id of the vote.
    /// @param _from Member's address who has given the vote.
    /// @param _claimId Claim Id for which vote has been given by the Member.
    /// @param _voteid Vote Id which will be stored against the given _from and claimid.
    function setUser_Claim_VoteMember(address _from,uint _claimId,uint _voteid) onlyInternal
    {
        user_claim_voteMember[_from][_claimId]=_voteid;
    }

    /// @dev Increases the count of failure until payout of a claim is succeeded.
    function updateState16Count(uint _claimId,uint8 _cnt) onlyInternal
    {
        claim_State16Count[_claimId] =SafeMaths.add8(claim_State16Count[_claimId],_cnt);
    }
    /// @dev Sets status of a claim.
    /// @param _claimId Claim Id.
    /// @param _stat Status number.
    function setClaimStatus(uint _claimId,uint8 _stat) onlyInternal
    {
        claim_Status[_claimId]=_stat;
    } 
    /// @dev Sets the date of a given claim at which the Claim's details has been updated/changed.
    /// @param _claimId Claim Id of claim which has been changed.
    /// @param _date_upd timestamp at which claim is updated.
    function setClaimdate_upd(uint _claimId,uint _date_upd) onlyInternal
    {
        allClaims[_claimId].date_upd = _date_upd;
    }

    function setClaimAtEmergencyPause (uint _coverId,uint _date_upd, bool _submit) onlyInternal {
        claimPause.push(claim_pause(_coverId,_date_upd,_submit));
    }
    /// @dev Get claim queued during emergency pause by index.
    function getClaimOfEmergencyPauseByIndex (uint _index) constant returns(uint coverId, uint date_upd, bool submit) {
        coverId = claimPause[_index].coverid;
        date_upd= claimPause[_index].date_upd;
        submit  = claimPause[_index].submit;
    }
    /// @dev set submission flag true after claim is submitted.
    function setClaimSubmittedAtEPTrue (uint _index,bool _submit) onlyInternal {
        claimPause[_index].submit=_submit;
    }
    /// @dev Get number of claims submitted during emergency pause.
    function getLengthOfClaimSubmittedAtEP () constant returns(uint len) {
        len=claimPause.length;
    }
    /// @dev Set the index from which claim needs to be submitted when emergency pause is swithched off.
    function setFirstClaimIndexToSubmitAfterEP (uint _FirstClaimIndexToSubmit) onlyInternal {
        claim_pause_lastsubmit=_FirstClaimIndexToSubmit;
    }
    /// @dev Get the index from which claim needs to be submitted when emergency pause is swithched off.
    function getFirstClaimIndexToSubmitAfterEP () constant returns(uint FirstClaimIndexToSubmit) {
        FirstClaimIndexToSubmit = claim_pause_lastsubmit;
    }
    /// @dev Set the pending vote time for a claim in case of emergency pause.
    function setPendingClaimDetails(uint _claimId,uint _pendingTime, bool _voting) onlyInternal {
        claimPauseVotingEP.push(claimPauseVoting(_claimId,_pendingTime,_voting));
    }
    /// @dev set voting flag true after claim is reopened for voting after emergency pause.
    function setPendingClaimVoteStatus(uint _claimId,bool _vote) onlyInternal {
        claimPauseVotingEP[_claimId].voting=_vote;
    }
    /// @dev Get number of claims to be reopened for voting after emergency pause.
    function getLengthOfClaimVotingPause() constant returns(uint len) {
        len=claimPauseVotingEP.length;
    }

    /// @dev Get claim details to be reopened for voting after emergency pause.
    function getPendingClaimDetailsByIndex(uint _index) constant returns(uint claimId,uint pendingTime, bool voting) {
        claimId     =claimPauseVotingEP[_index].claimid;
        pendingTime =claimPauseVotingEP[_index].pendingTime;
        voting      =claimPauseVotingEP[_index].voting;
    }
    /// @dev Set the index from which claim needs to be reopened when emergency pause is swithched off.
    function setFirstClaimIndexToStartVotingAfterEP(uint _claimStartVotingFirstIndex) onlyInternal {
        claimStartVoting_firstIndex=_claimStartVotingFirstIndex;
    }
    /// @dev Get the index from which claim needs to be reopened when emergency pause is swithched off.
    function getFirstClaimIndexToStartVotingAfterEP() constant returns(uint firstindex) {
        firstindex=claimStartVoting_firstIndex;
    }
    /// @dev Set the time for which claim is deposited.
    function setClaimDepositTime(uint _time) onlyInternal {
        claimDepositTime=_time;
    }
    
    // function getCoverClaimCount(uint _coverid) constant returns(uint cid,uint8 count) {
    //     cid = _coverid;
    //     count= uint8(cover_claim[_coverid].length);
    // }
    
    function callVoteEvent(address _userAddress, uint _claimId, bytes4 _typeOf, uint _tokens, uint _submitDate, int8 _verdict) onlyInternal {
        Votes(_userAddress, _claimId, _typeOf, _tokens, _submitDate, _verdict);
    }
    
    function callClaimEvent(uint _coverId, address _userAddress, uint _claimId, uint _datesubmit) onlyInternal {
        Claim(_coverId, _userAddress, _claimId, _datesubmit);
    }
}
