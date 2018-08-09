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

pragma solidity 0.4.24;
import "./master.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract claimsData is Iupgradable {

    using SafeMaths for uint;
    master ms;
    address masterAddress;

    struct claim {
        uint coverId;
        uint dateUpd;
    }

    mapping(uint => int8) claimVote;
    mapping(uint => uint8) claimsStatus;
    mapping(uint => uint8) claimState12Count;

    struct vote {
        address voter;
        uint tokens;
        uint claimId;
        int8 verdict;
        bool rewardClaimed;
    }

    struct claimStatus {
        uint8 status;
        uint dateUpd;
    }

    struct claimTotalTokens {
        uint accept;
        uint deny;
    }

    claim[] allClaims;
    vote[] allvotes;

    struct claimsPause {
        uint coverid;
        uint dateUpd;
        bool submit;
    }

    claimsPause[] claimPause;
    uint claimPauseLastsubmit;

    struct claimPauseVoting {
        uint claimid;
        uint pendingTime;
        bool voting;
    }

    struct rewardDistributed {
        uint lastCAvoteIndex;
        uint lastMVvoteIndex;

    }

    struct claimRewardDetails {
        uint percCA;
        uint percMV;
        uint tokenToBeDist;

    }

    claimPauseVoting[] claimPauseVotingEP;
    uint claimStartVotingFirstIndex;

    event Claim(uint indexed coverId, address indexed userAddress, uint claimId, uint dateSubmit);
    event Votes(address indexed userAddress, uint indexed claimId, bytes4 indexed typeOf, uint tokens, uint submitDate, int8 verdict);

    mapping(uint => uint[]) claimVoteCA;
    mapping(uint => uint[]) claimVoteMember;
    mapping(address => rewardDistributed) voterVoteRewardReceived;
    mapping(uint => claimRewardDetails) claimRewardDetail;
    mapping(address => mapping(uint => uint)) userClaimVoteCA;
    mapping(address => mapping(uint => uint)) userClaimVoteMember;
    mapping(address => uint[]) voteAddressCA;
    mapping(address => uint[]) voteAddressMember;
    mapping(address => uint[]) allClaimsByAddress;
    mapping(uint => claimTotalTokens) claimTokensCA;
    mapping(uint => claimTotalTokens) claimTokensMV;

    uint32 public maxVotingTime;
    uint32 public minVotingTime;
    uint public pendingClaimStart;
    uint32 public payoutRetryTime;
    uint32 public escalationTime;
    uint public claimDepositTime;

    function claimsData() {
        escalationTime = 3600;
        pendingClaimStart = 0;
        maxVotingTime = 1800;
        minVotingTime = 1200;
        payoutRetryTime = SafeMaths.mul32(SafeMaths.mul32(24, 60), 60);
        allvotes.push(vote(0, 0, 0, 0, false));
        allClaims.push(claim(0, 0));
        claimDepositTime = SafeMaths.mul(1, 7 days);
    }

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = master(masterAddress);
        } else {
            ms = master(masterAddress);
            require(ms.isInternal(msg.sender) == true);
            masterAddress = _add;
           
        }
    }

    function changeDependentContractAddress() onlyInternal {
        
    }
    
    modifier onlyOwner {
        require(ms.isOwner(msg.sender) == true);
        _;
    }

    modifier onlyInternal {
        require(ms.isInternal(msg.sender) == true);
        _;
    }

    /// @dev Sets the escalation time.
    function setEscalationTime(uint32 _time) onlyInternal {
        escalationTime = _time;
    }

    /// @dev Sets Maximum time(in seconds) for which claim assessment voting is open
    function setMaxVotingTime(uint32 _time) onlyInternal {
        maxVotingTime = _time;
    }

    /// @dev Sets Minimum time(in seconds) for which claim assessment voting is open
    function setMinVotingTime(uint32 _time) onlyInternal {
        minVotingTime = _time;
    }

    /// @dev Sets the payout retry time 
    function setPayoutRetryTime(uint32 _time) onlyInternal {
        payoutRetryTime = _time;
    }

    /// @dev Gets the Claim's details of given claimid.
    function getAllClaimsByIndex(uint _claimId) constant returns(uint coverId, int8 vote, uint8 status, uint dateUpd, uint8 state12Count) {
        return(
            allClaims[_claimId].coverId, 
            claimVote[_claimId],
            claimsStatus[_claimId],
            allClaims[_claimId].dateUpd,
            claimState12Count[_claimId]
        );
    }

    /// @dev Gets the vote id of a given claim of a given Claim Assessor.
    function getUserClaimVoteCA(address _add, uint _claimId) constant returns(uint idVote) {
        return userClaimVoteCA[_add][_claimId];
    }

    /// @dev Gets the vote id of a given claim of a given member. 
    function getUserClaimVoteMember(address _add, uint _claimId) constant returns(uint idVote) {
        return userClaimVoteMember[_add][_claimId];
    }
    
    /// @dev Gets the count of all votes.
    function getAllVoteLength() constant returns(uint voteCount) {
        return SafeMaths.sub(allvotes.length, 1); //Start Index always from 1.
    }

    /// @dev Gets the status number of a given claim.
    /// @param _claimId Claim id.
    /// @return statno Status Number.
    function getClaimStatusNumber(uint _claimId) constant returns(uint claimId, uint8 statno) {
        return (_claimId, claimsStatus[_claimId]);
    }

    /// @dev Gets the number of tries that have been made for a successful payout of a Claim.
    function getClaimState12Count(uint _claimId) constant returns(uint8 num) {
        num = claimState12Count[_claimId];
    }
       
    /// @dev Gets the last update date of a claim. 
    function getClaimDateUpd(uint _claimId) constant returns(uint dateupd) {
        dateupd = allClaims[_claimId].dateUpd;
    }

    /// @dev Gets all Claims created by a user till date.
    /// @param _member user's address.
    /// @return claimarr List of claims id.
    function getAllClaimsByAddress(address _member) constant returns(uint[] claimarr) {
        return allClaimsByAddress[_member];
    }

    /// @dev Gets the number of tokens that has been locked while giving vote to a claim by  Claim Assessors.
    /// @param _claimId Claim Id.
    /// @return accept Total number of tokens when CA accepts the claim.
    /// @return deny Total number of tokens when CA declines the claim.
    function getClaimsTokenCA(uint _claimId) constant returns(uint claimId, uint accept, uint deny) {
        return (_claimId, claimTokensCA[_claimId].accept, claimTokensCA[_claimId].deny);
    }

    /// @dev Gets the number of tokens that have been locked while assessing a claim as a member.
    /// @param _claimId Claim Id.
    /// @return accept Total number of tokens in acceptance of the claim.
    /// @return deny Total number of tokens against the claim.
    function getClaimsTokenMV(uint _claimId) constant returns(uint claimId, uint accept, uint deny) {
        return (_claimId, claimTokensMV[_claimId].accept, claimTokensMV[_claimId].deny);
    }

    /// @dev Gets the total number of votes cast as claims assessor for/against a given claim
    function getCaClaimVotesToken(uint _claimId) constant returns(uint claimId, uint cnt) {
        claimId = _claimId;
        cnt = 0;
        for (uint i = 0; i < claimVoteCA[_claimId].length; i++) {
            cnt = SafeMaths.add(cnt, allvotes[claimVoteCA[_claimId][i]].tokens);
        }
    }

    /// @dev Gets the total number of tokens cast as a member for/against a given claim
    function getMemberClaimVotesToken(uint _claimId) constant returns(uint claimId, uint cnt) {
        claimId = _claimId;
        cnt = 0;
        for (uint i = 0; i < claimVoteMember[_claimId].length; i++) {
            cnt = SafeMaths.add(cnt, allvotes[claimVoteMember[_claimId][i]].tokens);
        }
    }

    /// @dev Provides information of a vote when given its vote id.
    /// @param _voteid Vote Id.
    function getVoteDetails(uint _voteid) 
    constant 
    returns(
        uint tokens, 
        uint claimId, 
        int8 verdict, 
        bool rewardClaimed
        ) //,int8 claimVerdict,uint8 status
    {

        return (allvotes[_voteid].tokens, allvotes[_voteid].claimId, allvotes[_voteid].verdict, allvotes[_voteid].rewardClaimed); //,decision ,status
    }

    /// @dev Gets the voter's address of a given vote id.
    function getVoterVote(uint _voteid) constant returns(address voter) {
        return allvotes[_voteid].voter;
    }

    /// @dev Provides information of a Claim when given its claim id.
    /// @param _claimId Claim Id.
    function getClaim(uint _claimId) constant returns(uint claimId, uint coverId, int8 vote, uint8 status, uint dateUpd, uint8 state12Count) {
        return (
            _claimId, 
            allClaims[_claimId].coverId, 
            claimVote[_claimId], 
            claimsStatus[_claimId], 
            allClaims[_claimId].dateUpd, 
            claimState12Count[_claimId]
            );
    }

    /// @dev Gets the total number of votes of a given claim.
    /// @param _claimId Claim Id.
    /// @param _ca if 1: votes given by Claim Assessors to a claim, 
    //        else returns the number of votes of given by Members to a claim.
    /// @return len total number of votes for/against a given claim.
    function getClaimVoteLength(uint _claimId, uint8 _ca) constant returns(uint claimId, uint len) {
        claimId = _claimId;
        if (_ca == 1)
            len = claimVoteCA[_claimId].length;
        else
            len = claimVoteMember[_claimId].length;
    }

    /// @dev Gets the verdict of a vote using claim id and index.
    /// @param _ca 1 for vote given as a CA, else for vote given as a member.
    /// @return ver 1 if vote was given in favour,-1 if given in against.
    function getVoteVerdict(uint _claimId, uint _index, uint8 _ca) constant returns(int8 ver) {
        if (_ca == 1)
            ver = allvotes[claimVoteCA[_claimId][_index]].verdict;
        else
            ver = allvotes[claimVoteMember[_claimId][_index]].verdict;
    }

    /// @dev Gets the Number of tokens of a vote using claim id and index.
    /// @param _ca 1 for vote given as a CA, else for vote given as a member.
    /// @return tok Number of tokens.
    function getVoteToken(uint _claimId, uint _index, uint8 _ca) constant returns(uint tok) {
        if (_ca == 1)
            tok = allvotes[claimVoteCA[_claimId][_index]].tokens;
        else
            tok = allvotes[claimVoteMember[_claimId][_index]].tokens;
    }

    /// @dev Gets the Voter's address of a vote using claim id and index.
    /// @param _ca 1 for vote given as a CA, else for vote given as a member.
    /// @return voter Voter's address.
    function getVoteVoter(uint _claimId, uint _index, uint8 _ca) constant returns(address voter) {
        if (_ca == 1)
            voter = allvotes[claimVoteCA[_claimId][_index]].voter;
        else
            voter = allvotes[claimVoteMember[_claimId][_index]].voter;
    }

    /// @dev Gets total number of claims created by a user till date.
    /// @param _add User's address.
    function getUserClaimCount(address _add) constant returns(uint len) {
        len = allClaimsByAddress[_add].length;
    }

    /// @dev Calculates number of claims that are in pending state.
    function getClaimLength() constant returns(uint len) {
        len = SafeMaths.sub(allClaims.length, pendingClaimStart);
    }

    /// @dev Gets the Number of all the Claims created till date.
    function actualClaimLength() constant returns(uint len) {
        len = allClaims.length;
    }

    /// @dev Updates the pending claim start variable, the lowest claim id with a pending decision/payout.
    function setpendingClaimStart(uint _start) onlyInternal {
        require(pendingClaimStart <= _start);
        pendingClaimStart = _start;
    }

    /// @dev Gets details of a claim.
    /// @param _index claim id = pending claim start + given index
    /// @param _add User's address.
    /// @return coverid cover against which claim has been submitted.
    /// @return claimId Claim  Id.
    /// @return voteCA verdict of vote given as a Claim Assessor.
    /// @return voteMV verdict of vote given as a Member.
    /// @return statusnumber Status of claim.
    function getClaimFromNewStart(uint _index, address _add) 
    constant 
    returns(uint coverid, uint claimId, int8 voteCA, int8 voteMV, uint8 statusnumber) {
        uint i = SafeMaths.add(pendingClaimStart, _index);
        coverid = allClaims[i].coverId;
        claimId = i;
        if (userClaimVoteCA[_add][i] > 0)
            voteCA = allvotes[userClaimVoteCA[_add][i]].verdict;
        else
            voteCA = 0;

        if (userClaimVoteMember[_add][i] > 0)
            voteMV = allvotes[userClaimVoteMember[_add][i]].verdict;
        else
            voteMV = 0;

        statusnumber = claimsStatus[i];
    }

    /// @dev Gets details of a claim of a user at a given index.
    function getUserClaimByIndex(uint _index, address _add) constant returns(uint8 status, uint coverid, uint claimId) {
        claimId = allClaimsByAddress[_add][_index];
        status = claimsStatus[claimId];
        coverid = allClaims[claimId].coverId;
    }

    /// @dev Gets Id of all the votes given to a claim.
    /// @param _claimId Claim Id.
    /// @return ca id of all the votes given by Claim assessors to a claim.
    /// @return mv id of all the votes given by members to a claim.
    function getAllVotesForClaim(uint _claimId) constant returns(uint claimId, uint[] ca, uint[] mv) {
        return (_claimId, claimVoteCA[_claimId], claimVoteMember[_claimId]);
    }

    /// @dev Gets Number of tokens deposit in a vote using Claim assessor's address and claim id.
    /// @return tokens Number of deposited tokens.
    function getTokensClaim(address _of, uint _claimId) constant returns(uint claimId, uint tokens) {
        return (_claimId, allvotes[userClaimVoteCA[_of][_claimId]].tokens);
    }

    /// @param _voter address of the voter.
    /// @return lastCAvoteIndex last index till which reward was distributed for CA
    /// @return lastMVvoteIndex last index till which reward was distributed for member
    function getRewardDistributedIndex(address _voter) constant returns(uint lastCAvoteIndex, uint lastMVvoteIndex) {
        return (voterVoteRewardReceived[_voter].lastCAvoteIndex, voterVoteRewardReceived[_voter].lastMVvoteIndex);
    }

    /// @param _voter address of the voter.
    /// @param caIndex last index till which reward was distributed for CA
    function setRewardDistributedIndexCA(address _voter, uint caIndex) onlyInternal {
        voterVoteRewardReceived[_voter].lastCAvoteIndex = caIndex;

    }

    /// @param _voter address of the voter.
    /// @param mvIndex last index till which reward was distributed for member
    function setRewardDistributedIndexMV(address _voter, uint mvIndex) onlyInternal {

        voterVoteRewardReceived[_voter].lastMVvoteIndex = mvIndex;
    }

    /// @param claimid claim id.
    /// @param percCA reward Percentage for claim assessor
    /// @param percMV reward Percentage for members
    /// @param tokens total tokens to be rewarded
    function setClaimRewardDetail(uint claimid, uint percCA, uint percMV, uint tokens) onlyInternal {

        claimRewardDetail[claimid].percCA = percCA;
        claimRewardDetail[claimid].percMV = percMV;
        claimRewardDetail[claimid].tokenToBeDist = tokens;
    }

    /// @param claimid claim id.
    /// @return perc_CA reward Percentage for claim assessor
    /// @return perc_MV reward Percentage for members
    /// @return tokens total tokens to be rewarded
    function getClaimRewardDetail(uint claimid) constant returns(uint percCA, uint percMV, uint tokens) {
        return (claimRewardDetail[claimid].percCA, claimRewardDetail[claimid].percMV, claimRewardDetail[claimid].tokenToBeDist);
    }

    /// @dev Gets last timestamp at which claim has been updated.
    function setClaimDateUpd(uint _claimId, uint _time) onlyInternal {
        allClaims[_claimId].dateUpd = _time;
    }

    /// @dev Gets cover id of a claim.
    function getClaimCoverId(uint _claimId) constant returns(uint claimId, uint coverid) {
        return (_claimId, allClaims[_claimId].coverId);
    }

    /// @dev Gets total number of tokens staked during voting by Claim Assessors.
    /// @param _claimId Claim Id.
    /// @param _verdict 1 to get total number of accept tokens, -1 to get total number of deny tokens.
    /// @return token token Number of tokens(either accept or deny on the basis of verdict given as parameter).
    function getClaimVote(uint _claimId, int8 _verdict) constant returns(uint claimId, uint token) {
        claimId = _claimId;
        token = 0;
        for (uint i = 0; i < claimVoteCA[_claimId].length; i++) {
            if (allvotes[claimVoteCA[_claimId][i]].verdict == _verdict)
                token = SafeMaths.add(token, allvotes[claimVoteCA[_claimId][i]].tokens);
        }
    }

    /// @dev Gets total number of tokens staked during voting by Members.
    /// @param _claimId Claim Id.
    /// @param _verdict 1 to get total number of accept tokens, -1 to get total number of deny tokens.
    /// @return token token Number of tokens(either accept or deny on the basis of verdict given as parameter).
    function getClaimMVote(uint _claimId, int8 _verdict) constant returns(uint claimId, uint token) {
        claimId = _claimId;
        token = 0;
        for (uint i = 0; i < claimVoteMember[_claimId].length; i++) {
            if (allvotes[claimVoteMember[_claimId][i]].verdict == _verdict)
                token = SafeMaths.add(token, allvotes[claimVoteMember[_claimId][i]].tokens);
        }
    }

    /// @param _voter address  of voteid
    /// @param index index to get voteid in CA
    function getVoteAddressCA(address _voter, uint index) constant returns(uint) {
        return voteAddressCA[_voter][index];
    }

    /// @param _voter address  of voter
    /// @param index index to get voteid in member vote
    function getVoteAddressMember(address _voter, uint index) constant returns(uint) {
        return voteAddressMember[_voter][index];
    }

    /// @param _voter address  of voter
    function getVoteAddressCALength(address _voter) constant returns(uint) {
        return voteAddressCA[_voter].length;
    }

    /// @param _voter address  of voter
    function getVoteAddressMemberLength(address _voter) constant returns(uint) {
        return voteAddressMember[_voter].length;
    }

    /// @dev Sets the reward claim status against a vote id.
    /// @param _voteid vote Id.
    /// @param claimed true if reward for vote is claimed, else false.
    function setRewardClaimed(uint _voteid, bool claimed) onlyInternal {
        allvotes[_voteid].rewardClaimed = claimed;
    }

    /// @dev Sets the final vote's result(either accepted or declined)of a claim.
    /// @param _claimId Claim Id.
    /// @param _verdict 1 if claim is accepted,-1 if declined.
    function changeFinalVerdict(uint _claimId, int8 _verdict) onlyInternal {
        claimVote[_claimId] = _verdict;
    }

    /// @dev Changes the verdict of Member vote.
    function changeVerdictOfMV(uint _claimId, uint _index, int8 _verdict) onlyInternal {
        allvotes[claimVoteMember[_claimId][_index]].verdict = _verdict;
    }

    /// @dev Changes the verdict of Claim Assessors vote.
    function changeVerdictOfCAV(uint _claimId, uint _index, int8 _verdict) onlyInternal {
        allvotes[claimVoteCA[_claimId][_index]].verdict = _verdict;
    }

    /// @dev Gets the Final result of voting of a claim.
    /// @param _claimId Claim id.
    /// @return verdict 1 if claim is accepted, -1 if declined.
    function getFinalVerdict(uint _claimId) constant returns(int8 verdict) {
        return claimVote[_claimId];
    }

    /// @dev Creates a new claim.
    function addClaim(uint _claimId, uint _coverId, address _from, uint _nowtime) onlyInternal {
        allClaims.push(claim(_coverId, _nowtime));
        allClaimsByAddress[_from].push(_claimId);

    }

    /// @dev Stores a given claim id in a given address. Maintains the record of all the claims created/submitted by a given user.
    /// @param _from address of a user.
    /// @param _claimId Claim id which will be stored.
    function addClaimSender(address _from, uint _claimId) onlyInternal {
        allClaimsByAddress[_from].push(_claimId);
    }

    /// @dev Add Vote's details of a given claim.
    function addVote(address _voter, uint _tokens, uint claimId, int8 _verdict) onlyInternal {
        allvotes.push(vote(_voter, _tokens, claimId, _verdict, false));
    }

    /// @dev Stores the id of the claim assessor vote given to a claim.
    ///      Maintains record of all votes given by all the CA to a claim.
    /// @param _claimId Claim Id to which vote has given by the CA.
    /// @param _voteid Vote Id. 
    function addClaimVoteCA(uint _claimId, uint _voteid) onlyInternal {
        claimVoteCA[_claimId].push(_voteid);
    }

    /// @dev Sets the id of the vote.
    /// @param _from Claim assessor's address who has given the vote.
    /// @param _claimId Claim Id for which vote has been given by the CA.
    /// @param _voteid Vote Id which will be stored against the given _from and claimid.
    function setUserClaimVoteCA(address _from, uint _claimId, uint _voteid) onlyInternal {
        userClaimVoteCA[_from][_claimId] = _voteid;
        voteAddressCA[_from].push(_voteid);
    }

    /// @dev Stores the tokens given by the Claim Assessors during voting of a given claim.
    /// @param _claimId Claim Id.
    /// @param _vote 1 for accept and increases the tokens of claim as accept, -1 for deny and increases the tokens of claim as deny.
    /// @param _tokens Number of tokens.
    function setClaimTokensCA(uint _claimId, int8 _vote, uint _tokens) onlyInternal {
        if (_vote == 1)
            claimTokensCA[_claimId].accept = SafeMaths.add(claimTokensCA[_claimId].accept, _tokens);
        if (_vote == -1)
            claimTokensCA[_claimId].deny = SafeMaths.add(claimTokensCA[_claimId].deny, _tokens);
    }

    /// @dev Stores the tokens given by the Members during voting of a given claim.
    /// @param _claimId Claim Id.
    /// @param _vote 1 for accept and increases the tokens of claim as accept, -1 for deny and increases the tokens of claim as deny.
    /// @param _tokens Number of tokens.
    function setClaimTokensMV(uint _claimId, int8 _vote, uint _tokens) onlyInternal {
        if (_vote == 1)
            claimTokensMV[_claimId].accept = SafeMaths.add(claimTokensMV[_claimId].accept, _tokens);
        if (_vote == -1)
            claimTokensMV[_claimId].deny = SafeMaths.add(claimTokensMV[_claimId].deny, _tokens);
    }

    /// @dev Stores the id of the member vote given to a claim.
    ///      Maintains record of all votes given by all the Members to a claim.
    /// @param _claimId Claim Id to which vote has been given by the Member.
    /// @param _voteid Vote Id.
    function addClaimVotemember(uint _claimId, uint _voteid) onlyInternal {
        claimVoteMember[_claimId].push(_voteid);
    }

    /// @dev Sets the id of the vote.
    /// @param _from Member's address who has given the vote.
    /// @param _claimId Claim Id for which vote has been given by the Member.
    /// @param _voteid Vote Id which will be stored against the given _from and claimid.
    function setUserClaimVoteMember(address _from, uint _claimId, uint _voteid) onlyInternal {
        userClaimVoteMember[_from][_claimId] = _voteid;
        voteAddressMember[_from].push(_voteid);

    }

    /// @dev Increases the count of failure until payout of a claim is successful.
    function updateState12Count(uint _claimId, uint8 _cnt) onlyInternal {
        claimState12Count[_claimId] = SafeMaths.add8(claimState12Count[_claimId], _cnt);
    }

    /// @dev Sets status of a claim.
    /// @param _claimId Claim Id.
    /// @param _stat Status number.
    function setClaimStatus(uint _claimId, uint8 _stat) onlyInternal {
        claimsStatus[_claimId] = _stat;
    }

    /// @dev Sets the timestamp of a given claim at which the Claim's details has been updated.
    /// @param _claimId Claim Id of claim which has been changed.
    /// @param _dateUpd timestamp at which claim is updated.
    function setClaimdateUpd(uint _claimId, uint _dateUpd) onlyInternal {
        allClaims[_claimId].dateUpd = _dateUpd;
    }

    /// @dev Ques claims during Emergency Pause.
    function setClaimAtEmergencyPause(uint _coverId, uint _dateUpd, bool _submit) onlyInternal {
        claimPause.push(claimsPause(_coverId, _dateUpd, _submit));
    }

    /// @dev Get claim queued during emergency pause by index.
    function getClaimOfEmergencyPauseByIndex(uint _index) constant returns(uint coverId, uint dateUpd, bool submit) {
        coverId = claimPause[_index].coverid;
        dateUpd = claimPause[_index].dateUpd;
        submit = claimPause[_index].submit;
    }

    /// @dev Set submission flag for claims queued during emergency pause.
    ///      Set to true after EP is turned off and the claim is submitted .
    function setClaimSubmittedAtEPTrue(uint _index, bool _submit) onlyInternal {
        claimPause[_index].submit = _submit;
    }

    /// @dev Get number of claims queued for submission during emergency pause.
    function getLengthOfClaimSubmittedAtEP() constant returns(uint len) {
        len = claimPause.length;
    }

    /// @dev Sets the index from which claim needs to be submitted when emergency pause is swithched off.
    function setFirstClaimIndexToSubmitAfterEP(uint _firstClaimIndexToSubmit) onlyInternal {
        claimPauseLastsubmit = _firstClaimIndexToSubmit;
    }

    /// @dev Gets the index from which claim needs to be submitted when emergency pause is swithched off.
    function getFirstClaimIndexToSubmitAfterEP() constant returns(uint firstClaimIndexToSubmit) {
        firstClaimIndexToSubmit = claimPauseLastsubmit;
    }

    /// @dev Sets the pending vote duration for a claim in case of emergency pause.
    function setPendingClaimDetails(uint _claimId, uint _pendingTime, bool _voting) onlyInternal {
        claimPauseVotingEP.push(claimPauseVoting(_claimId, _pendingTime, _voting));
    }

    /// @dev Sets voting flag true after claim is reopened for voting after emergency pause.
    function setPendingClaimVoteStatus(uint _claimId, bool _vote) onlyInternal {
        claimPauseVotingEP[_claimId].voting = _vote;
    }

    /// @dev Gets number of claims to be reopened for voting post emergency pause period.
    function getLengthOfClaimVotingPause() constant returns(uint len) {
        len = claimPauseVotingEP.length;
    }

    /// @dev Gets claim details to be reopened for voting after emergency pause.
    function getPendingClaimDetailsByIndex(uint _index) constant returns(uint claimId, uint pendingTime, bool voting) {
        claimId = claimPauseVotingEP[_index].claimid;
        pendingTime = claimPauseVotingEP[_index].pendingTime;
        voting = claimPauseVotingEP[_index].voting;
    }

    /// @dev Sets the index from which claim needs to be reopened when emergency pause is swithched off.
    function setFirstClaimIndexToStartVotingAfterEP(uint _claimStartVotingFirstIndex) onlyInternal {
        claimStartVotingFirstIndex = _claimStartVotingFirstIndex;
    }

    /// @dev Gets the index from which claim needs to be reopened when emergency pause is swithched off.
    function getFirstClaimIndexToStartVotingAfterEP() constant returns(uint firstindex) {
        firstindex = claimStartVotingFirstIndex;
    }

    /// @dev Sets the time for which claim is deposited.
    function setClaimDepositTime(uint _time) onlyInternal {
        claimDepositTime = _time;
    }

    /// @dev Calls Vote Event.
    function callVoteEvent(address _userAddress, uint _claimId, bytes4 _typeOf, uint _tokens, uint _submitDate, int8 _verdict) onlyInternal {
        Votes(_userAddress, _claimId, _typeOf, _tokens, _submitDate, _verdict);
    }

    /// @dev Calls Claim Event.
    function callClaimEvent(uint _coverId, address _userAddress, uint _claimId, uint _datesubmit) onlyInternal {
        Claim(_coverId, _userAddress, _claimId, _datesubmit);
    }
    
    /// @dev Sets the minimum, maximum claims assessment voting, escalation and payout retry times 
    /// @param _minVoteTime Minimum time(in seconds) for which claim assessment voting is open
    /// @param _maxVoteTime Maximum time(in seconds) for which claim assessment voting is open
    /// @param escaltime Time(in seconds) in which, after a denial by claims assessor, a person can escalate claim for member voting
    /// @param payouttime Time(in seconds) after which a payout is retried(in case a claim is accepted and payout fails)
    function setTimes(uint32 _minVoteTime, uint32 _maxVoteTime, uint32 escaltime, uint32 payouttime) onlyInternal {
        // Escalation time to be removed in future
        setEscalationTime(escaltime);
        setPayoutRetryTime(payouttime);
        setMaxVotingTime(_maxVoteTime);
        setMinVotingTime(_minVoteTime);
    }
}
