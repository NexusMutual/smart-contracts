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

import "./quotationData.sol";
import "./nxmToken.sol";
import "./nxmToken2.sol";
import "./nxmTokenData.sol";
import "./pool.sol";
// import "./pool2.sol";
import "./pool3.sol";
import "./poolData.sol";
import "./claimsReward.sol";
// import "./governance.sol";
import "./claimsData.sol";
import "./master.sol";
// import "./fiatFaucet.sol";
import "./SafeMaths.sol";
// import "./memberRoles.sol";

contract claims{
    using SafeMaths for uint;
    string[] claimStatus_desc;

    // address public token2Address;
    nxmToken2 tc2;
    // address public tokenAddress;
    nxmToken tc1;
    // address public claimsRewardAddress;
    claimsReward cr;
    // address public poolAddress;
    pool p1;
    // address public claimsDataAddress;
    claimsData cd;
    // address public nxmTokenDataAddress;  
    nxmTokenData td;
    // address public poolDataAddress; 
    poolData pd;
    // address public pool3Address;
    pool3 p3;
    address public masterAddress;
    master ms;
    // address public quotationDataAddress;
    quotationData qd;
    // memberRoles mr;

    uint64 private constant _DECIMAL_1e18 = 1000000000000000000;

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
    modifier onlyInternal {
        // ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == true);
        _; 
    }
    modifier isMemberAndcheckPause
    {
        // ms=master(masterAddress);
        require(ms.isPause()==false && ms.isMember(msg.sender)==true);
        _;
    }
    // function changeMemberRolesAddress(address memberAddress) onlyInternal
    // {
    //     // memberAddress = _add;
    //     mr=memberRoles(memberAddress);
    // }
    function changeTokenDataAddress(address nxmTokenDataAddress) onlyInternal
    {
        // nxmTokenDataAddress = _add;
        td = nxmTokenData(nxmTokenDataAddress);
    }
    function changeToken2Address(address nxmToken2Address) onlyInternal
    {
        // nxmToken2Address = _add;
        tc2 = nxmToken2(nxmToken2Address);
    }
    function changeClaimDataAddress(address claimsDataAddress) onlyInternal
    {
        // claimsDataAddress = _add;
        cd = claimsData(claimsDataAddress);
    }
    function changePoolAddress(address poolAddress) onlyInternal
    {
        // poolAddress = poolAdd;
        p1 = pool(poolAddress);
    }
    function changeTokenAddress(address nxmTokenAddress) onlyInternal
    {
        // nxmTokenAddress = _add;
        tc1 = nxmToken(nxmTokenAddress);
    }
    function changeQuotationDataAddress(address quotationDataAddress) onlyInternal
    {
        // quotationDataAddress = _add;
        qd = quotationData(quotationDataAddress);
    }
    function changePoolDataAddress(address poolDataAddress) onlyInternal
    {
        // poolDataAddress = _add;
        pd = poolData(poolDataAddress);
    }
    function changePool3Address(address pool3Address)onlyInternal
    {
        // pool3Address=_add;
        p3 = pool3(pool3Address);
    }
    function changeClaimRewardAddress(address claimsRewardAddress) onlyInternal
    {
        // claimsRewardAddress = _add;
        cr = claimsReward(claimsRewardAddress);
    }
    
    /// @dev Sets the minimum, maximum claims assessment voting, escalation and payout retry times 
    /// @param _minVoteTime Minimum time(in milliseconds) for which claim assessment voting is open
    /// @param _maxVoteTime Maximum time(in milliseconds) for which claim assessment voting is open
    /// @param escaltime Time(in milliseconds) in which, after a denial by claims assessor, a person can escalate claim for member voting
    /// @param payouttime Time(in milliseconds) after which a payout is retried(in case a claim is accepted and payout fails)
    function setTimes(uint32 _minVoteTime,uint32 _maxVoteTime,uint32 escaltime,uint32 payouttime)  onlyInternal
    {
        // cd=claimsData(claimsDataAddress);
        cd.setEscalationTime(escaltime);
        cd.setPayoutRetryTime(payouttime);
        cd.setMax_voting_time(_maxVoteTime);
        cd.setMin_voting_time(_minVoteTime);
    }  
   
    /// @dev Adds status names for Claims.
    function pushStatus(string stat) onlyInternal
    {
        claimStatus_desc.push(stat);
    }
    
    // /// @dev Gets the Number of tokens used in a specific vote, using claim id and index.
    // /// @param ca 1 for vote given as a CA, 0 for vote given as a member.
    // /// @return tok Number of tokens.
    // function getvoteToken(uint claimId,uint index,uint8 ca) constant returns (uint tok)
    // {
    //     cd=claimsData(claimsDataAddress);
    //     tok = cd.getVoteToken(claimId,index,ca);
    // }
    // /// @dev Gets the Voter's address of a vote using claim id and index.
    // /// @param ca 1 for vote given as a CA, 0 for vote given as a member.
    // /// @return voter Voter's address.
    // function getvoteVoter(uint claimId,uint index,uint8 ca) constant returns (address voter)
    // {
    //     cd=claimsData(claimsDataAddress);
    //     voter = cd.getVoteVoter(claimId,index,ca);
    // }
    /// @dev Gets claim details of claim id=pending claim start + given index
    function getClaimFromNewStart(uint index)constant returns(string status , uint coverId , uint claimId , int8 voteCA , int8 voteMV , uint8 statusnumber)
    {
        // cd=claimsData(claimsDataAddress);
        (coverId,claimId,voteCA,voteMV,statusnumber)=cd.getClaimFromNewStart(index,msg.sender);
        status = claimStatus_desc[statusnumber];
    }
     
    /// @dev Gets details of a claim submitted by the calling user, at a given index
    function getUserClaimByIndex(uint index)constant returns(string status , uint coverId , uint claimId)
    {
        // cd=claimsData(claimsDataAddress);
        uint statusno;
        (statusno,coverId,claimId) = cd.getUserClaimByIndex(index,msg.sender);
        status = claimStatus_desc[statusno];
    }
   
    // /// @dev Gets the total number of votes cast against given claim id.
    // /// @param claimId Claim Id.
    // /// @param ca if 1 : returns the number of votes cast as Claim Assessors , else returns the number of votes cast as a member
    // /// @return len total number of votes cast against given claimId.
    // function getClaimVoteLength(uint claimId,uint8 ca) constant returns(uint len)
    // {
    //     cd=claimsData(claimsDataAddress);
    //     len = cd.getClaimVoteLength(claimId,ca);
    // }
    /// @dev Sets the final vote result(either accept or decline)of a given claimId.
    /// @param claimId Claim Id.
    /// @param verdict 1 if claim is accepted,-1 if declined.
    function changeFinalVerdict(uint claimId,int8 verdict) onlyInternal
    {
        // cd=claimsData(claimsDataAddress);
        cd.changeFinalVerdict(claimId,verdict);
    }
     
    /// @dev Gets details of a given claim id.
    /// @param _claimId Claim Id.
    /// @return status Current status of claim id
    // /// @return dateAdd Claim Submission date
    /// @return finalVerdict Decision made on the claim, 1 in case of acceptance, -1 in case of denial
    /// @return claimOwner Address through which claim is submitted
    /// @return coverId Coverid associated with the claim id
     function getClaimbyIndex(uint _claimId) constant returns( uint claimId,string status,int8 finalVerdict , address claimOwner ,uint coverId) 
    {
        // qd=quotationData(quotationDataAddress);
        // cd=claimsData(claimsDataAddress);
       
        uint stat;
        claimId=_claimId;
        (,coverId,finalVerdict,stat,,)= cd.getClaim(_claimId);
        claimOwner = qd.getCoverMemberAddress(coverId);
        status = claimStatus_desc[stat];          
    }
    // /// @dev Gets details of a given vote id
    // /// @param voteid Vote Id.
    // /// @return tokens Number of tokens used by the voter to cast a vote
    // /// @return claimId Claim Id being assessed
    // /// @return verdict Vote: -1 in case of denail,1 in case of acceptance
    // /// @return date_submit Date on which vote is cast
    // /// @return tokenRec Number of tokens received for the vote casted
    // /// @return voter Voter Address
    // /// @return burned Number of tokens burnt by advisory board(in case of fraudulent voting)
    // function getVoteDetailsForAB(uint voteid) constant returns(uint tokens,uint claimId,int8 verdict, uint date_submit,uint tokenRec,address voter,uint burned)
    // {
    //     g1=governance(governanceAddress);
    //     cd=claimsData(claimsDataAddress);
    //     voter = cd.getVoter_Vote(voteid);
    //     int claimVerdict;
    //     (tokens,claimId,verdict,date_submit,tokenRec,claimVerdict,) = cd.getVoteDetails(voteid);
    //     burned = g1.checkIfTokensAlreadyBurned(claimId,voter);
    //     return(tokens,claimId,verdict,date_submit,tokenRec,voter,burned);
    // }
    /// @dev Gets number of tokens used by a given address to assess a given claimId 
    /// @param _of User's address.
    /// @param claimId Claim Id.
    /// @return value Number of tokens.
    function getCATokensLockedAgainstClaim(address _of , uint claimId) constant returns(uint value)
    {
        // cd=claimsData(claimsDataAddress);
        (,value) = cd.getTokens_claim(_of,claimId);
        // td=nxmTokenData(nxmTokenDataAddress);
        uint totalLockedCA = td.getBalanceCAWithAddress(_of);
        if(totalLockedCA < value)
            value = totalLockedCA;
    }

    /// @dev Calculates total amount that has been used to assess a claim. Computaion:Adds acceptCA(tokens used for voting in favor a claim) and denyCA(tokens used for voting against a claim) *  current token price.
    /// @param claimId Claim Id.
    /// @param member Member type 0 for calculating the amount used by Claim Assessors, else result gives amount used by members.
    /// @return Tokens Total Amount used in claims assessment.
     function getCATokens(uint claimId,uint member) constant returns(uint Tokens)
    {
        // tc1 = nxmToken(tokenAddress);
        // cd  = claimsData(claimsDataAddress);
        // qd = quotationData(quotationDataAddress);
        uint coverId;
        (,coverId) = cd.getClaimCoverId(claimId);
        bytes4 curr = qd.getCurrencyOfCover(coverId);
        uint tokenx1e18=tc1.getTokenPrice(curr);
        uint acceptCA;uint acceptMV;
        uint denyCA;uint denyMV;
        (,acceptCA,denyCA)= cd.getClaims_tokenCA(claimId);
        (,acceptMV,denyMV)= cd.getClaims_tokenMV(claimId);
        if(member==0)
            Tokens=SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptCA,denyCA)),tokenx1e18),_DECIMAL_1e18); // amount (not in tokens)
        else
            Tokens=SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptMV,denyMV)),tokenx1e18),_DECIMAL_1e18);
    }
    /// @dev Checks if voting of a claim should be closed or not.Internally called by checkVoteClosing method for claims whose status number is 0 or status number lie between 2 and 6.
    /// @param claimId Claim Id.
    /// @param status Current status of claim.
    /// @return close 1 if voting should be closed,0 in case voting should not be closed,-1 if voting has already been closed.
    function checkVoteClosingFinal(uint claimId,uint8 status) internal constant returns(int8 close)
    {
        close=0;
        // tc1=nxmToken(tokenAddress);
        // qd=quotationData(quotationDataAddress);
        // cd=claimsData(claimsDataAddress);
        uint coverId;
        (,coverId)= cd.getClaimCoverId(claimId);
        bytes4 curr = qd.getCurrencyOfCover(coverId);
        uint tokenx1e18=tc1.getTokenPrice(curr);
        uint acceptCA;uint acceptMV;
        uint denyCA;uint denyMV;
        (,acceptCA,denyCA)= cd.getClaims_tokenCA(claimId);
        (,acceptMV,denyMV)= cd.getClaims_tokenMV(claimId);
        uint CATokens=SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptCA,denyCA)),tokenx1e18),_DECIMAL_1e18);
        uint MVTokens=SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptMV,denyMV)),tokenx1e18),_DECIMAL_1e18);
        uint sumassured=SafeMaths.mul(qd.getCoverSumAssured(coverId),_DECIMAL_1e18);
        if(status==0 && CATokens>=SafeMaths.mul(10,sumassured))
            close=1;
        if(status>=2 && status<=6 && MVTokens>=SafeMaths.mul(10,sumassured))
            close=1;    
    }
    /// @dev Checks if voting of a claim should be closed or not.
    /// @param claimId Claim Id.
    /// @return close 1 if voting should be closed, 0 if voting should not be closed,-1 if voting has already been closed.
    function checkVoteClosing(uint claimId)constant returns(int8 close)
    {   
        close=0;
        // cd=claimsData(claimsDataAddress);
        uint8 status;
        (,status) = cd.getClaimStatusNumber(claimId); 
        uint date_upd = cd.getClaimDateUpd(claimId);
        if(status==16 && SafeMaths.add(date_upd, cd.payoutRetryTime()) < now )
            if( cd.getClaimState16Count(claimId) < 60)
                close=1;
        if(status>6)
            close=-1;
        else if(status==1 && SafeMaths.add(date_upd , cd.escalationTime()) > now)
            close=-1;
        else if(status==1 && SafeMaths.add(date_upd , cd.escalationTime()) <= now)
            close=1;
        else if(SafeMaths.add(date_upd, cd.max_voting_time())<=now) 
            close=1;
        else if(SafeMaths.add(date_upd, cd.min_voting_time())>=now) 
            close=0;
        else if(status==0 || ( status >= 2 && status <= 6 ) )
        { 
            close = checkVoteClosingFinal(claimId,status);
        }
    }

    function setClaimStatus(uint claimId,uint8 stat) onlyInternal 
    {
        setClaimStatusInternal(claimId,stat);
    }
    
    /// @dev Changes the status of an existing claim id, based on current status and current conditions of the system
    /// @param claimId Claim Id.
    /// @param stat status number.
    function setClaimStatusInternal(uint claimId,uint8 stat) internal
    {
        // cr=claims_Reward(claims_rewardAddress);
        // cd=claimsData(claimsDataAddress);
        uint origstat;
        uint state16Count;
        uint date_upd;
        (,,,origstat,date_upd,state16Count)= cd.getClaim(claimId);
        (,origstat) = cd.getClaimStatusNumber(claimId);
        if(stat==16 && origstat==16)
        {
            cd.updateState16Count(claimId,1);
        }
        cd.setClaimStatus(claimId,stat);
        if(state16Count >= 60 && stat==16)
            cd.setClaimStatus(claimId,17);
        uint time=now;     
        cd.setClaimdate_upd(claimId,time);
        // cd.addClaimStatus(claimId,stat,time);
        // p1=pool(poolAddress);
        if(stat >=3 && stat<=6)
        {
            p1.closeClaimsOraclise(claimId, cd.max_voting_time());
        }
        if(stat==16 && (SafeMaths.add(date_upd, cd.payoutRetryTime()) <= now) && (state16Count < 60))
        {
            cr.changeClaimStatus(claimId);
        }
        else if(stat==16 && (SafeMaths.add(date_upd, cd.payoutRetryTime()) > now) && (state16Count < 60))
        {
            uint64 timeLeft =uint64(SafeMaths.sub(SafeMaths.add(date_upd, cd.payoutRetryTime()) ,now));
            p1.closeClaimsOraclise(claimId,timeLeft);
        }
    }
   
    /// @dev Updates the pending claim start variable, which is the lowest claim id with a pending decision/payout.
    function changePendingClaimStart() onlyInternal
    {
        // cd=claimsData(claimsDataAddress);
        uint8 origstat;
        uint8 state16Count;
        uint pendingClaim_start=cd.pendingClaim_start();
        uint actualClaimLength=cd.actualClaimLength();
        for(uint i= pendingClaim_start;i < actualClaimLength;i++)
        {
            (,,,origstat,,state16Count)= cd.getClaim(i);
         
            if(origstat>6 && ((origstat!=16) || (origstat==16 && state16Count >= 60)))
                cd.setpendingClaim_start(i);
            else
                break;
        }
    }

    /// @dev Submits a claim for a given cover note. Adds claim to queue incase of emergency pause else directly submits the claim.
    /// @param coverId Cover Id.
    function submitClaim(uint coverId)
    {
        // qd=quotationData(quotationDataAddress);
        address qadd=qd.getCoverMemberAddress(coverId);
        if(qadd != msg.sender) throw;
        // ms=master(masterAddress);
        if(ms.isPause()==false)
            addClaim(coverId,now,qadd);
        else{
            // cd=claimsData(claimsDataAddress);
            cd.setClaimAtEmergencyPause(coverId,now,false);
            qd.changeCoverStatusNo(coverId,5);
        }
    }
    ///@dev Submits a claim for a given cover note. Deposits 20% of the tokens locked against cover.
    function addClaim (uint coverId, uint time,address add) internal {
        // qd=quotationData(quotationDataAddress);
        // tc2=nxmToken2(token2Address);
        // cd=claimsData(claimsDataAddress);
        // td = nxmTokenData(tokenDataAddress);
        uint nowtime=now;
        uint tokens;uint coverLength;
        (,coverLength) = td.getUser_cover_depositCNLength(add,coverId);
        if(coverLength==0){
            (,,tokens) = td.getUser_cover_lockedCN(add,coverId);
            tokens =SafeMaths.div(SafeMaths.mul(tokens,20),100);
        }
        else
            (,,,tokens)=td.getUser_cover_depositCNByIndex(add,coverId,0);
        // if(tokens==0){
        //     (,tokens)=td.getUser_cover_lockedCN(add,coverId);
        //     tokens =SafeMaths.div(SafeMaths.mul(tokens,20),100);
        // }
        uint timeStamp = SafeMaths.add(nowtime, cd.claimDepositTime());
        tc2.depositCN(coverId,tokens,timeStamp,add);
        uint len = cd.actualClaimLength(); 
        cd.addClaim(len,coverId,add,nowtime);
        cd.callClaimEvent(coverId, msg.sender, len, time);
        qd.changeCoverStatusNo(coverId,4);
        // uint8 CoverClaimCount;
        // (,CoverClaimCount)=cd.getCoverClaimCount(coverId);
        // cd.addCover_Claim(coverId,CoverClaimCount);
        bytes4 curr=qd.getCurrencyOfCover(coverId);
        uint sumAssured=qd.getCoverSumAssured(coverId);
        // pd = poolData1(poolDataAddress);
        pd.changeCurrencyAssetVarMin(curr,SafeMaths.add64(pd.getCurrencyAssetVarMin(curr),uint64(sumAssured)));
        checkLiquidity(curr);
        // p1=pool(poolAddress);
        p1.closeClaimsOraclise(len, cd.max_voting_time());
    }
    ///@dev Submits the claims queued once the emergency pause is switched off.
    function submitClaimAfterEPOff () onlyInternal {
        // cd=claimsData(claimsDataAddress);
        // qd=quotationData(quotationDataAddress);
        uint lengthOfClaimSubmittedAtEP = cd.getLengthOfClaimSubmittedAtEP();
        uint FirstClaimIndexToSubmitAfterEP= cd.getFirstClaimIndexToSubmitAfterEP();
        uint coverId;
        uint date_upd;
        bool submit;
        for(uint i=FirstClaimIndexToSubmitAfterEP; i<lengthOfClaimSubmittedAtEP;i++){
            (coverId,date_upd,submit) = cd.getClaimOfEmergencyPauseByIndex(i);
            if(submit==false){
                address qadd=qd.getCoverMemberAddress(coverId);
                addClaim(coverId,date_upd,qadd);
                cd.setClaimSubmittedAtEPTrue(i,true);
            }
        }
        cd.setFirstClaimIndexToSubmitAfterEP(lengthOfClaimSubmittedAtEP);
    }

    // 12/1/2017
    function checkLiquidity(bytes4 curr)
    {
        // p3=pool3(pool3Address);
        uint8 check;uint CABalance;
        (check,CABalance)= p3.checkLiquidity(curr);     
        if(check==1)
        {
            p3.ExcessLiquidityTrading(curr,CABalance);
        }   
        else if(check==2)
        {
            p3.InsufficientLiquidityTrading(curr,CABalance,0);
        }
    }
    
    /// @dev Members who have tokens locked under Claims Assessment can assess and Vote As a CLAIM ASSESSOR for a given claim id.
    /// @param claimId  claim id. 
    /// @param verdict 1 for Accept,-1 for Deny.
    /// @param tokens number of CAtokens a voter wants to use for the claim assessment.These tokens are booked for a specified period for time and hence cannot be used to cst another vote for the specified period
    function submitCAVote(uint claimId,int8 verdict,uint tokens) isMemberAndcheckPause
    {  
        // cd=claimsData(claimsDataAddress);
        if(checkVoteClosing(claimId) == 1) throw;
        uint8 stat;
        (,stat)=cd.getClaimStatusNumber(claimId);
        if(stat != 0) throw;
        if(cd.getUser_Claim_VoteCA(msg.sender,claimId) != 0) throw;
        // tc1=nxmToken(tokenAddress);
        tc1.bookCATokens(msg.sender, tokens);
        cd.addVote(msg.sender,tokens,verdict);
        cd.callVoteEvent(msg.sender, claimId, "CAV", tokens, now, verdict);
        uint vote_length=cd.getAllVoteLength();
        cd.addClaim_Vote_ca(claimId,vote_length);
        cd.setUser_Claim_VoteCA(msg.sender,claimId,vote_length);
        cd.setClaim_tokensCA(claimId,verdict,tokens);
        int close = checkVoteClosing(claimId);
        if(close==1)
        {
            // cr=claims_Reward(claims_rewardAddress);
            cr.changeClaimStatus(claimId);
        }
    }
    /// @dev Escalates a specified claim id. If a claim is denied by the Claim Assessors, the owner of that claim can Escalate the Claim to a member vote.
    /// @param coverId Cover Id associated with claim to be escalated.
    /// @param claimId Claim Id.
    function escalateClaim(uint coverId, uint claimId) isMemberAndcheckPause
    {  
        // qd=quotationData(quotationDataAddress);
        address cadd=qd.getCoverMemberAddress(coverId);
        if(cadd != msg.sender) throw;
        // td = nxmTokenData(tokenDataAddress);
        uint tokens;
        (,tokens)= td.getUser_cover_lockedCN(cadd,coverId);
        tokens = SafeMaths.div(SafeMaths.mul(tokens,20),100);
        // cd=claimsData(claimsDataAddress);
        uint d=SafeMaths.mul(864000 , cd.escalationTime()) ;
        uint timeStamp = SafeMaths.add(now , d);
        // tc2 = nxmToken2(token2Address);
        tc2.depositCN(coverId,tokens,timeStamp,msg.sender);
        setClaimStatus(claimId,2);
        qd.changeCoverStatusNo(coverId,4);
        // uint8 CoverClaimCount;
        // (,CoverClaimCount)=cd.getCoverClaimCount(coverId);
        // cd.addCover_Claim(coverId,CoverClaimCount);
        // p1=pool(poolAddress);
        p1.closeClaimsOraclise(claimId,cd.max_voting_time());
    } 

    /// @dev Submits a member vote for assessing a claim. Tokens other than those locked under Claims Assessment can be used to cast a vote for a given claim id.
    /// @param claimId Selected claim id. 
    /// @param verdict 1 for Accept,-1 for Deny.
    /// @param tokens Number of tokens used to case a vote
    function submitMemberVote(uint claimId,int8 verdict,uint tokens) isMemberAndcheckPause
    {
        // cd=claimsData(claimsDataAddress);
        if(checkVoteClosing(claimId) == 1) throw;
        uint stat;
        (,stat)=cd.getClaimStatusNumber(claimId);
        if(stat <2 || stat >6) throw;
        if(cd.getUser_Claim_VoteMember(msg.sender,claimId) != 0) throw;
        uint vote_length=cd.getAllVoteLength();
        cd.addVote(msg.sender,tokens,verdict);
        cd.callVoteEvent(msg.sender, claimId, "MV", tokens, now, verdict);
        cd.addClaim_vote_member(claimId,vote_length);
        cd.setUser_Claim_VoteMember(msg.sender,claimId,vote_length);
        cd.setClaim_tokensMV(claimId,verdict,tokens);
        int close = checkVoteClosing(claimId);
        if(close==1)
        {
            // cr=claims_Reward(claims_rewardAddress);
            cr.changeClaimStatus(claimId);
        }   
    }

    /// @dev Pause Voting of All Pending Claims when Emergency Pause Start.
    function PauseAllPendingClaimsVoting() onlyInternal
    {
        // cd=claimsData(claimsDataAddress);
        uint FirstIndex=cd.pendingClaim_start();
        uint actualClaimLength=cd.actualClaimLength();
        for(uint i=FirstIndex; i<actualClaimLength; i++)
        {
            if(checkVoteClosing(i)==0){
                uint date_upd = cd.getClaimDateUpd(i);
                cd.setPendingClaimDetails(i,SafeMaths.sub((SafeMaths.add(date_upd,cd.max_voting_time())),now),false);
            }
        }
    }
}
