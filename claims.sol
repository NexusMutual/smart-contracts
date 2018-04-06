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
import "./quotation2.sol";
import "./NXMToken.sol";
import "./NXMToken2.sol";
import "./pool.sol";
import "./claims_Reward.sol";
import "./governance.sol";
import "./claimsData.sol";
import "./master.sol";
import "./NXMTokenData.sol";
import "./poolData1.sol";
import "./fiatFaucet.sol";
import "./MCRData.sol";
import "./SafeMaths.sol";
import "./pool2.sol";
import "./pool3.sol";
contract claims{
    using SafeMaths for uint;
    string[]  claimStatus_desc;
    NXMToken2 tc2;
    address public token2Address;
    address  tokenAddress;
    address  quotation2Address;
    address  claims_rewardAddress;
    address poolAddress;
    address governanceAddress;    
    address claimsDataAddress;
    address tokenDataAddress;  
    address poolDataAddress; 
    address fiatFaucetAddress;
    address MCRDataAddress;
    address pool2Address;
    address pool3Address;
   
    
    NXMToken tc1;
    quotation2 q1;
    master ms1;
    NXMTokenData td1;
    address masterAddress;
    claims_Reward cr1;
    pool p1;
    governance g1;
    claimsData c1;
    poolData1 pd1;
    fiatFaucet f1;
    MCRData md1;
    pool2 p2;
    pool3 p3;


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
    modifier isMemberAndcheckPause
    {
        ms1=master(masterAddress);
        require(ms1.isPause()==0 && ms1.isMember(msg.sender)==true);
        _;
    }
    function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td1 = NXMTokenData(tokenDataAddress);
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
        quotation2Address = newAddress;
    }
    function changePoolDataAddress(address _add) onlyInternal
    {
        poolDataAddress = _add;
    }
    function changeFiatFaucetAddress(address _to) onlyInternal
    {
        fiatFaucetAddress = _to;
    }
    function changeMCRDataAddress(address _add) onlyInternal
    {
        MCRDataAddress = _add;
    }
    function changePool2Address(address _add)onlyInternal
    {
        pool2Address=_add;
    }
    function changePool3Address(address _add)onlyInternal
    {
        pool3Address=_add;
    }
    /// @dev Sets the minimum, maximum claims assessment voting, escalation and payout retry times 
    /// @param _mintime Minimum time(in milliseconds) for which claim assessment voting is open
    /// @param _maxtime Maximum time(in milliseconds) for which claim assessment voting is open
    /// @param escaltime Time(in milliseconds) in which, after a denial by claims assessor, a person can escalate claim for member voting
    /// @param payouttime Time(in milliseconds) after which a payout is retried(in case a claim is accepted and payout fails)
    function setTimes(uint32 _mintime,uint32 _maxtime,uint32 escaltime,uint32 payouttime)  onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.setEscalationTime(escaltime);
        c1.setPayoutRetryTime(payouttime);
        c1.setMaxTime(_maxtime);
        c1.setMinTime(_mintime);
       
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
    
    /// @dev Gets the Number of tokens used in a specific vote, using claim id and index.
    /// @param ca 1 for vote given as a CA, 0 for vote given as a member.
    /// @return tok Number of tokens.
    function getvoteToken(uint claimid,uint index,uint8 ca) constant returns (uint tok)
    {
        c1=claimsData(claimsDataAddress);
        tok = c1.getvoteToken(claimid,index,ca);
    }
    /// @dev Gets the Voter's address of a vote using claim id and index.
    /// @param ca 1 for vote given as a CA, 0 for vote given as a member.
    /// @return voter Voter's address.
    function getvoteVoter(uint claimid,uint index,uint8 ca) constant returns (address voter)
    {
        c1=claimsData(claimsDataAddress);
        voter = c1.getvoteVoter(claimid,index,ca);
    }
    /// @dev Gets claim details of claim id=pending claim start + given index
    function getClaimFromNewStart(uint index)constant returns(string status , uint coverid , uint claimid , int8 voteCA , int8 voteMV , uint8 statusnumber)
    {
       c1=claimsData(claimsDataAddress);
       (coverid,claimid,voteCA,voteMV,statusnumber)=c1.getClaimFromNewStart(index,msg.sender);
       status = claimStatus_desc[statusnumber];

    }
     
    /// @dev Gets details of a claim submitted by the calling user, at a given index
    function getUserClaimByIndex(uint index)constant returns(string status , uint coverid , uint claimid)
    {
        c1=claimsData(claimsDataAddress);
        uint statusno;
        (statusno,coverid,claimid) = c1.getUserClaimByIndex(index,msg.sender);
        status = claimStatus_desc[statusno];
    }
   
    /// @dev Gets the total number of votes cast against given claim id.
    /// @param claimid Claim Id.
    /// @param ca if 1 : returns the number of votes cast as Claim Assessors , else returns the number of votes cast as a member
    /// @return len total number of votes cast against given claimid.
    function getClaimVoteLength(uint claimid,uint8 ca) constant returns(uint len)
    {
        c1=claimsData(claimsDataAddress);
        len = c1.getClaimVoteLength(claimid,ca);
    }
    /// @dev Sets the final vote result(either accept or decline)of a given claimid.
    /// @param claimid Claim Id.
    /// @param verdict 1 if claim is accepted,-1 if declined.
    function changeFinalVerdict(uint claimid,int8 verdict) onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        c1.changeFinalVerdict(claimid,verdict);
    }
     
    /// @dev Gets details of a given claim id.
    /// @param ind Claim Id.
    /// @return status Current status of claim id
    /// @return dateAdd Claim Submission date
    /// @return finalVerdict Decision made on the claim, 1 in case of acceptance, -1 in case of denial
    /// @return claimOwner Address through which claim is submitted
    /// @return coverid Coverid associated with the claim id
     function getClaimbyIndex(uint ind) constant returns( uint claimId,string status,uint dateAdd ,int8 finalVerdict , address claimOwner ,uint coverid) 
    {
        q1=quotation2(quotation2Address);
        c1=claimsData(claimsDataAddress);
       
        uint stat;
        claimId=ind;
        (coverid,dateAdd,finalVerdict,stat,,)=c1.getClaim(ind);
        claimOwner = q1.getMemberAddress(coverid);
        // quoteid=q1.getQuoteId(coverid);
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
    function getVoteDetailsForAB(uint voteid) constant returns(uint tokens,uint claimId,int8 verdict, uint date_submit,uint tokenRec,address voter,uint burned)
    {
        g1=governance(governanceAddress);
        c1=claimsData(claimsDataAddress);
        voter = c1.getvoter_vote(voteid);
        int claimVerdict;
        (tokens,claimId,verdict,date_submit,tokenRec,claimVerdict,) = c1.getVoteDetails(voteid);
        burned = g1.checkIfTokensAlreadyBurned(claimId,voter);
        return(tokens,claimId,verdict,date_submit,tokenRec,voter,burned);
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

    /// @dev Calculates total amount that has been used to assess a claim. Computaion:Adds acceptCA(tokens used for voting in favor a claim) and denyCA(tokens used for voting against a claim) *  current token price.
    /// @param claimid Claim Id.
    /// @param member Member type 0 for calculating the amount used by Claim Assessors, else result gives amount used by members.
    /// @return Tokens Total Amount used in claims assessment.
     function getCATokens(uint claimid,uint member) constant returns(uint Tokens)
    {
        tc1=NXMToken(tokenAddress);
        q1=quotation2(quotation2Address);
        c1=claimsData(claimsDataAddress);
        uint coverid = c1.getClaimCoverId(claimid);
        bytes4 curr = q1.getCurrencyOfCover(coverid);
        uint tokenx1e18=tc1.getTokenPrice(curr);
        uint acceptCA;uint acceptMV;
        uint denyCA;uint denyMV;
        (acceptCA,denyCA)=c1.getClaims_tokenCA(claimid);
        (acceptMV,denyMV)=c1.getClaims_tokenMV(claimid);
        if(member==0)
            Tokens=SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptCA,denyCA)),tokenx1e18),1000000000000000000); // amount (not in tokens)
        else
            Tokens=SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptMV,denyMV)),tokenx1e18),1000000000000000000);
        
    }
    /// @dev Checks if voting of a claim should be closed or not.Internally called by checkVoteClosing method for claims whose status number is 0 or status number lie between 2 and 6.
    /// @param claimid Claim Id.
    /// @param status Current status of claim.
    /// @return close 1 if voting should be closed,0 in case voting should not be closed,-1 if voting has already been closed.
    function checkVoteClosingFinal(uint claimid,uint8 status) internal constant returns(int8 close)
    {
        close=0;
        tc1=NXMToken(tokenAddress);
        q1=quotation2(quotation2Address);
        c1=claimsData(claimsDataAddress);
        uint coverid = c1.getClaimCoverId(claimid);
        bytes4 curr = q1.getCurrencyOfCover(coverid);
        uint tokenx1e18=tc1.getTokenPrice(curr);
        uint acceptCA;uint acceptMV;
        uint denyCA;uint denyMV;
        (acceptCA,denyCA)=c1.getClaims_tokenCA(claimid);
        (acceptMV,denyMV)=c1.getClaims_tokenMV(claimid);
        uint CATokens=SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptCA,denyCA)),tokenx1e18),1000000000000000000);
        uint MVTokens=SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptMV,denyMV)),tokenx1e18),1000000000000000000);
        uint sumassured=SafeMaths.mul(q1.getSumAssured(coverid),1000000000000000000);
        if(status==0 && CATokens>=SafeMaths.mul(10,sumassured))
            close=1;
        if(status>=2 && status<=6 && MVTokens>=SafeMaths.mul(10,sumassured))
            close=1;    
    }
    /// @dev Checks if voting of a claim should be closed or not.
    /// @param claimid Claim Id.
    /// @return close 1 if voting should be closed, 0 if voting should not be closed,-1 if voting has already been closed.
    function checkVoteClosing(uint claimid)constant returns(int8 close)
    {   
        close=0;
        c1=claimsData(claimsDataAddress);
        uint8 status=c1.getClaimStatusNumber(claimid); 
        uint date_upd = c1.getClaimDateUpd(claimid);
        if(status==16 && SafeMaths.add(date_upd,c1.payoutRetryTime()) < now )
            if( c1.getClaimState16Count(claimid) < 60)
                close=1;
        if(status>6)
            close=-1;
        else if(status==1 && SafeMaths.add(date_upd , c1.escalationTime()) > now)
            close=-1;
        else if(status==1 && SafeMaths.add(date_upd , c1.escalationTime()) <= now)
            close=1;
        else if(SafeMaths.add(date_upd,c1.maxtime())<=now) 
            close=1;
        else if(SafeMaths.add(date_upd, c1.mintime())>=now) 
            close=0;
        else if(status==0 || ( status >= 2 && status <= 6 ) )
        { 
            close = checkVoteClosingFinal(claimid,status);
        }
        
                
    }

    function setClaimStatus(uint claimid,uint8 stat) onlyInternal 
    {
        setClaimStatusInternal(claimid,stat);
    }
    
    /// @dev Changes the status of an existing claim id, based on current status and current conditions of the system
    /// @param claimid Claim Id.
    /// @param stat status number.
    function setClaimStatusInternal(uint claimid,uint8 stat) internal
    {
        cr1=claims_Reward(claims_rewardAddress);
        c1=claimsData(claimsDataAddress);
        uint origstat;
        uint state16Count;
        uint date_upd;
        (,,,origstat,date_upd,state16Count)=c1.getClaim(claimid);
        origstat=c1.getClaimStatus(claimid);
        if(stat==16 && origstat==16)
        {
            c1.updatestate16Count(claimid,1);
        }
        c1.setClaimStatus(claimid,stat);
        if(state16Count >= 60 && stat==16)
            c1.setClaimStatus(claimid,17);
        uint time=now;     
        c1.setClaimdate_upd(claimid,time);
        c1.addClaimStatus(claimid,stat,time);
        p1=pool(poolAddress);
        if(stat >=3 && stat<=6)
        {
            p1.closeClaimsOraclise(claimid,c1.maxtime());
        }
        if(stat==16 &&  (SafeMaths.add(date_upd , c1.payoutRetryTime()) <= now) && (state16Count < 60))
        {
            cr1.changeClaimStatus(claimid);
        }
        else if(stat==16 &&  (SafeMaths.add(date_upd, c1.payoutRetryTime()) > now) && (state16Count < 60))
        {
            uint64 timeLeft =uint64(SafeMaths.sub(SafeMaths.add(date_upd, c1.payoutRetryTime()) ,now));
            p1.closeClaimsOraclise(claimid,timeLeft);
        }
    }
   
    /// @dev Updates the pending claim start variable, which is the lowest claim id with a pending decision/payout.
    function changePendingClaimStart() onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        uint8 origstat;
        uint8 state16Count;
       
        for(uint i=c1.pendingClaim_start();i<c1.actualClaimLength();i++)
        {
         
            (,,,origstat,,state16Count)=c1.getClaim(i);
         
            if(origstat>6 && ((origstat!=16) || (origstat==16 && state16Count >= 60)))
                c1.setpendingClaim_start(i);
            else
                break;
        }
    }

  

    /// @dev Submits a claim for a given cover note. Adds claim to queue incase of emergency pause else directly submits the claim.
    /// @param coverid Cover Id.
    function submitClaim(uint16 coverid)
    {
        q1=quotation2(quotation2Address);
        address qadd=q1.getMemberAddress(coverid);
        if(qadd != msg.sender) throw;
        ms1=master(masterAddress);
        if(ms1.isPause()==0)
            addClaim(coverid,now,qadd);
        else{
            c1=claimsData(claimsDataAddress);
            c1.setClaimAtEmergencyPause(coverid,now,false);
            q1.updateCoverStatus(coverid,5);
        }
    }
    ///@dev Submits a claim for a given cover note. Deposits 20% of the tokens locked against cover.
    function addClaim (uint16 coverid, uint time,address add) internal {
        q1=quotation2(quotation2Address);
        tc2=NXMToken2(token2Address);
        c1=claimsData(claimsDataAddress);
        td1 = NXMTokenData(tokenDataAddress);
        uint nowtime=now;
        uint tokens;
        (,tokens)=td1.getLockedCN_Cover(add,coverid);
        tokens =SafeMaths.div(SafeMaths.mul(tokens,20),100);
        uint timeStamp = SafeMaths.add(nowtime , c1.claimDepositTime());
        tc2.depositCN(coverid,tokens,timeStamp,add);
        uint len = c1.actualClaimLength(); 
        c1.addClaim(len,coverid,add,time,nowtime);
        q1.updateCoverStatusAndCount(coverid,4);
        bytes4 curr=q1.getCurrencyOfCover(coverid);
        uint sumAssured=q1.getSumAssured(coverid);
        pd1 = poolData1(poolDataAddress);
        pd1.changeCurrencyAssetVarMin(curr,SafeMaths.add64(pd1.getCurrencyAssetVarMin(curr),uint64(sumAssured)));
        checkLiquidity(curr);
        p1=pool(poolAddress);
        p1.closeClaimsOraclise(len,c1.maxtime());
    }
    ///@dev Submits the claims queued once the emergency pause is switched off.
    function submitClaimAfterEPOff () onlyInternal {
        c1=claimsData(claimsDataAddress);
        q1=quotation2(quotation2Address);
        uint lengthOfClaimSubmittedAtEP = c1.getLengthOfClaimSubmittedAtEP();
        uint FirstClaimIndexToSubmitAfterEP= c1.getFirstClaimIndexToSubmitAfterEP();
        uint16 coverid;
        uint date_upd;
        bool submit;
        for(uint i=FirstClaimIndexToSubmitAfterEP; i<lengthOfClaimSubmittedAtEP;i++){
            (coverid,date_upd,submit) = c1.getClaimOfEmergencyPauseByIndex(i);
            if(submit==false){
                address qadd=q1.getMemberAddress(coverid);
                addClaim(coverid,date_upd,qadd);
                c1.setClaimSubmittedAtEPTrue(i,true);
            }
        }
        c1.setFirstClaimIndexToSubmitAfterEP(lengthOfClaimSubmittedAtEP);
    }

    // 12/1/2017
    function checkLiquidity(bytes4 curr)
    {
        p3=pool3(pool3Address);
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
    /// @param claimid  claim id. 
    /// @param verdict 1 for Accept,-1 for Deny.
    /// @param tokens number of CAtokens a voter wants to use for the claim assessment.These tokens are booked for a specified period for time and hence cannot be used to cst another vote for the specified period
    function submitCAVote(uint claimid,int8 verdict,uint tokens) isMemberAndcheckPause
    {  
        c1=claimsData(claimsDataAddress);
        if(checkVoteClosing(claimid) == 1) throw;
        if(c1.getClaimStatus(claimid) != 0) throw;
        if(c1.getvote_ca(claimid,msg.sender) != 0) throw;
        tc1=NXMToken(tokenAddress);
        tc1.bookCATokens(msg.sender , tokens);
        c1.addVote(msg.sender,tokens,claimid,verdict,now,0);
        uint vote_length=c1.getAllVoteLength();
        c1.addclaim_vote_ca(claimid,vote_length);
        c1.setvote_ca(msg.sender,claimid,vote_length);
        // c1.addvote_address_ca(msg.sender,vote_length);
        // c1.setvote_length(SafeMaths.add(vote_length,1));
        c1.setclaim_tokensCA(claimid,verdict,tokens);
        int close = checkVoteClosing(claimid);
        if(close==1)
        {
            cr1=claims_Reward(claims_rewardAddress);
            cr1.changeClaimStatus(claimid);
        }

    }
    /// @dev Escalates a specified claim id. If a claim is denied by the Claim Assessors, the owner of that claim can Escalate the Claim to a member vote.
    /// @param coverId Cover Id associated with claim to be escalated.
    /// @param claimId Claim Id.
    function escalateClaim(uint coverId , uint claimId) isMemberAndcheckPause
    {  
        tc2 = NXMToken2(token2Address);
        q1=quotation2(quotation2Address);
        tc1=NXMToken(tokenAddress);
        address cadd=q1.getMemberAddress(coverId);
        if(cadd != msg.sender) throw;
        td1 = NXMTokenData(tokenDataAddress);
        uint tokens;
        (,tokens)= td1.getLockedCN_Cover(cadd,coverId);
        tokens = SafeMaths.div(SafeMaths.mul(tokens,20),100);
        c1=claimsData(claimsDataAddress);
        uint d=SafeMaths.mul(864000 , c1.escalationTime()) ;
        uint timeStamp = SafeMaths.add(now , d);
        tc2.depositCN(coverId,tokens,timeStamp,msg.sender);
        setClaimStatus(claimId,2);
        q1.updateCoverStatusAndCount(coverId,4);
        p1=pool(poolAddress);
        p1.closeClaimsOraclise(claimId,c1.maxtime());
    } 

    /// @dev Submits a member vote for assessing a claim. Tokens other than those locked under Claims Assessment can be used to cast a vote for a given claim id.
    /// @param claimid Selected claim id. 
    /// @param verdict 1 for Accept,-1 for Deny.
    /// @param tokens Number of tokens used to case a vote
    function submitMemberVote(uint claimid,int8 verdict,uint tokens) isMemberAndcheckPause
    {
        c1=claimsData(claimsDataAddress);
        if(checkVoteClosing(claimid) == 1) throw;
        uint stat=c1.getClaimStatus(claimid);
        if(stat <2 || stat >6) throw;
        if(c1.getvote_member(claimid,msg.sender) != 0) throw;
        uint vote_length=c1.getAllVoteLength();
        c1.addVote(msg.sender,tokens,claimid,verdict,now,0);
        c1.addclaim_vote_member(claimid,vote_length);
        c1.setvote_member(msg.sender,claimid,vote_length);
        // c1.addvote_address_member(msg.sender,vote_length);
        // c1.setvote_length(SafeMaths.add(vote_length,1));
        c1.setclaim_tokensMV(claimid,verdict,tokens);
        int close = checkVoteClosing(claimid);
        if(close==1)
        {
            cr1=claims_Reward(claims_rewardAddress);
            cr1.changeClaimStatus(claimid);
        }   
    }

    /// @dev Pause Voting of All Pending Claims when Emergency Pause Start.
    function PauseAllPendingClaimsVoting() onlyInternal
    {
        c1=claimsData(claimsDataAddress);
        uint FirstIndex=c1.pendingClaim_start();
        for(uint i=FirstIndex; i<c1.actualClaimLength(); i++)
        {
            if(checkVoteClosing(i)==0){
                uint date_upd = c1.getClaimDateUpd(i);
                c1.setPendingClaimDetails(i,SafeMaths.sub((SafeMaths.add(date_upd,c1.maxtime())),now),false);
            }
        }
    }
}