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

//Claims Reward Contract contains the functions for calculating number of tokens  that will get rewarded, unlocked or burned depending upon the status of claim.   

pragma solidity ^0.4.11;
import "./quotationData.sol";
import "./NXMToken.sol";
import "./claims.sol";
import "./pool.sol";
import "./NXMToken2.sol";
import "./NXMTokenData.sol";
import "./master.sol";
import "./claimsData.sol";
import "./pool2.sol";
import "./poolData1.sol";
import "./pool3.sol";
import "./SafeMaths.sol";
contract claims_Reward
{ 
    using SafeMaths for uint;
    NXMToken tc1;
    NXMToken2 tc2;
    // NXMTokenData td1;
    quotationData qd;
    claimsData cd;
    poolData1 pd;
    master ms;
    claims c1;
    pool p1;
    pool2 p2;
    pool3 p3;
    address public masterAddress;
    address public token2Address;
    // address public tokenDataAddress;
    address public poolAddress;
    address public tokenAddress;
    address public quotationDataAddress;
    address public claimsAddress;
    address public pool2Address;
    address public claimsDataAddress;
    address public poolDataAddress;
    address public pool3Address;
    
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000)
            masterAddress = _add;
        else
        {
            ms=master(masterAddress);
            if(ms.isInternal(msg.sender) == 1)
                masterAddress = _add;
            else
                throw;
        }
    }
    modifier onlyInternal {
        ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == 1);
        _; 
    }
    modifier checkPause
    {
        ms=master(masterAddress);
        require(ms.isPause()==0);
        _;
    }
    function changeToken2Address(address _add) onlyInternal
    {
        token2Address = _add;
        tc2 = NXMToken2(token2Address);
    }

    // function changeTokenDataAddress(address _add) onlyInternal
    // {
    //     tokenDataAddress = _add;
    //     td1=NXMTokenData(tokenDataAddress);
    // }
   
    function changeClaimDataAddress(address _add) onlyInternal
    {
        claimsDataAddress = _add;
    }

    function changePoolAddress(address _to) onlyInternal
    {
        poolAddress = _to;
    }
    function changeTokenAddress(address newAddress) onlyInternal
    {
        tokenAddress = newAddress;
    }
    function changeQuotationDataAddress(address _add) onlyInternal
    {
        quotationDataAddress = _add;
        qd = quotationData(quotationDataAddress);
    }
    function changeClaimsAddress(address newAddress) onlyInternal
    {
        claimsAddress = newAddress;
    }
    function changePool2Address(address newAddress) onlyInternal
    {
        pool2Address=newAddress;
    }
    function changePoolDataAddress(address newAddress) onlyInternal
    {
        poolDataAddress = newAddress;
    }
   
    /// @dev Computes the result of Claim Assessors Voting for a given claim id.
    function changeClaimStatusCA(uint claimid, uint16 coverid,uint8 status) internal
    {
        c1=claims(claimsAddress);
        cd=claimsData(claimsDataAddress);
        qd=quotationData(quotationDataAddress);
        // Check if voting should be closed or not
        if(c1.checkVoteClosing(claimid)==1)
        { 
            uint CATokens=c1.getCATokens(claimid,0);
            uint reward_claim=0;            
            if(CATokens==0)
            {
                status=4;
            }
            else
            { 
                uint sumassured=qd.getCoverSumAssured(coverid);
                uint threshold_unreached=0;
                // Minimum threshold for CA voting is reached only when value of tokens used for voting > 5* sum assured of claim id
                if(CATokens<SafeMaths.mul(SafeMaths.mul(5,sumassured),1000000000000000000))
                    threshold_unreached=1;

                uint accept=cd.getClaimVote(claimid,1);
                uint deny=cd.getClaimVote(claimid,-1);
               
                if( SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) > 70 &&  threshold_unreached==0)
                {
                   status=8;
                   qd.changeCoverStatus(coverid,1);
                   // Call API of pool
                   reward_claim=1;
                }
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > 70 &&  threshold_unreached==0)
                {
                    status=1;
                    // p1.closeClaimsOraclise(len,cd.escalationTime());
                }
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) &&  threshold_unreached==0)
                    status=6;
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) <= SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) &&  threshold_unreached==0)
                    status=5;
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) &&  threshold_unreached==1)
                    status=4;
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) <= SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) &&  threshold_unreached==1)
                    status=3;
            }
            c1.setClaimStatus(claimid,status);
            if(reward_claim==1)
                rewardAgainstClaim(claimid,coverid,status);
        }
    }

    /// @dev Computes the result of Member Voting for a given claim id.
    function changeClaimStatusMV(uint claimid,uint16 coverid,uint8 status) internal
    {
        c1=claims(claimsAddress); 
        cd=claimsData(claimsDataAddress);
        qd=quotationData(quotationDataAddress);   
        // Check if voting should be closed or not 
        if(c1.checkVoteClosing(claimid)==1)
        { 
            uint16 coverStatus;
            uint8 status_orig=status;
            uint MVTokens=c1.getCATokens(claimid,1);
            // In case noone votes, claim is denied
            if(MVTokens==0 )
            {
                status=15; 
                coverStatus=2;                
            }
            else
            {   
                // If tokens used for acceptance >50%, claim is accepted
                uint sumassured=qd.getCoverSumAssured(coverid);
                uint threshold_unreached=0;
                // Minimum threshold for member voting is reached only when value of tokens used for voting > 5* sum assured of claim id
                if(MVTokens<SafeMaths.mul(SafeMaths.mul(5,sumassured),1000000000000000000))
                    threshold_unreached=1;
                uint accept=cd.getClaimMVote(claimid,1);
                uint deny=cd.getClaimMVote(claimid,-1);  

                if(SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) >= 50 &&  threshold_unreached==0 && status_orig==2)
                { status=9;coverStatus=1;}
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > 50 &&  threshold_unreached==0 && status_orig==2)
                { status=10;coverStatus=2;}
                else if(  threshold_unreached==1 && status_orig==2)
                { status=11; coverStatus=2;}
                else if(SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) >= 50 &&  status_orig>2 && status_orig<=6 && threshold_unreached==0)
                { status=12; coverStatus=1;}
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > 50 &&  status_orig>2 && status_orig<=6 && threshold_unreached==0)
                { status=13;coverStatus=2;}
                else if(threshold_unreached==1 &&  (status_orig==3 || status_orig==5))
                { status=14; coverStatus=1;}
                else if(threshold_unreached==1 &&  (status_orig==6 || status_orig==4))
                { status=15; coverStatus=2;}
            }
            c1.setClaimStatus(claimid,status);
            qd.changeCoverStatus(coverid,coverStatus);
            // Reward/Punish Claim Assessors and Members who participated in claims assessment
            rewardAgainstClaim(claimid,coverid,status);
        }
    }

    /// @dev Depending upon the current status of the claim, corresponding functions are called and next status of the claim is decided accordingly.
    function changeClaimStatus(uint claimid) checkPause
    {
        ms=master(masterAddress);
        p2=pool2(pool2Address);
        if(ms.isInternal(msg.sender) != 1 && ms.isOwner(msg.sender)!=1) throw;
        c1=claims(claimsAddress);
        cd=claimsData(claimsDataAddress);
        qd=quotationData(quotationDataAddress);
        uint16 coverid=cd.getClaimCoverId(claimid);
        // uint quoteId = qd.getCoverQuoteid(coverid);
        uint8 status=cd.getClaimStatus(claimid);
        
        // when current status is "Pending-Claim Assessor Vote"
        if(status==0)
        {
            changeClaimStatusCA(claimid,coverid,status);
           
        }
        // when current status is Pending-Claim Assessor Vote Denied, pending RM Escalation
        else if(status==1)
        {
            c1.setClaimStatus(claimid,7);
            qd.changeCoverStatus(coverid,2);
            rewardAgainstClaim(claimid,coverid,status);
        }
        // when current status is between 2 and 6, i.e. "Pending Member Vote"
        else if(status>=2 && status<=6)
        {
            changeClaimStatusMV(claimid,coverid,status);
        }
        // when current status is "Claim Accepted Payout Pending"
        else if(status == 16)
        {
            bool succ = p2.sendClaimPayout(coverid,claimid);
            if(succ)
            {
                c1.setClaimStatus(claimid,18);
            }
        }
        c1.changePendingClaimStart();
    }
    /// @dev Rewards/Punishes users who  participated in claims assessment. Unlocking and burning of the tokens will also depend upon the status of claim.
    /// @param claimid Claim Id.
    function rewardAgainstClaim(uint claimid,uint16 coverid, uint8 status) internal
    {
        tc1=NXMToken(tokenAddress);
        tc2=NXMToken2(token2Address);
        bool succ;
        qd=quotationData(quotationDataAddress);
        c1 = claims(claimsAddress);
        cd = claimsData(claimsDataAddress);
        pd = poolData1(poolDataAddress);
        bytes4 curr=qd.getCurrencyOfCover(coverid);
        uint32 sumAssured=qd.getCoverSumAssured(coverid);
        p1=pool(poolAddress);

        if(status==7) // Final-Claim Assessor Vote Denied
        {
            c1.changeFinalVerdict(claimid,-1);
            rewardCAVoters(claimid,100,curr,sumAssured);  // Rewards Claims Assessor only
            tc2.burnCNToken(coverid); // Burns tokens deposited at the time of claim submission
            if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
            {
                pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
                c1.checkLiquidity(curr);
            }
        }
        if(status==8)
        {
            c1.changeFinalVerdict(claimid,1);
            rewardCAVoters(claimid,100,curr,sumAssured); // Rewards Claims Assessor only
            tc1.unlockCN(coverid); // Unlocks token locked against cover note
            succ = p2.sendClaimPayout(coverid,claimid); //Initiates payout
        }
        if(status==9)
        {
            c1.changeFinalVerdict(claimid,1);
            rewardCAVoters(claimid,50,curr,sumAssured);  // Distributes rewards between claims assessor and members who voted
            rewardMVoters(claimid,50,curr,sumAssured);
            tc1.unlockCN(coverid);
            succ = p2.sendClaimPayout(coverid,claimid);
            // if(!succ)
            //     throw;
        }
        if(status==10)
        {
            c1.changeFinalVerdict(claimid,-1);
            rewardCAVoters(claimid,50,curr,sumAssured);
            rewardMVoters(claimid,50,curr,sumAssured);
            tc2.burnCNToken(coverid);
           
            if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
            {
                pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
                c1.checkLiquidity(curr);
            }
        }
        if(status==11)
        {
            c1.changeFinalVerdict(claimid,-1);
            // uint8 cc = cd.getCoverClaimCount(coverid);
            cd.addCover_Claim(coverid,cd.getCoverClaimCount(coverid)); //cc+1
            rewardCAVoters(claimid,100,curr,sumAssured);
            tc2.undepositCN(coverid,0);
            tc2.burnCNToken(coverid);
            
            if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
            {
                pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
                c1.checkLiquidity(curr);
            }
        }
        if(status==12)
        {
            c1.changeFinalVerdict(claimid,1);
            rewardMVoters(claimid,100,curr,sumAssured);
            tc1.unlockCN(coverid);
            succ = p2.sendClaimPayout(coverid,claimid);
           
        }
        if(status==13)
        {
            c1.changeFinalVerdict(claimid,-1);
            rewardMVoters(claimid,100,curr,sumAssured);
            tc2.burnCNToken(coverid);
            if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
            {
                pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
                c1.checkLiquidity(curr);
            }
         }
        if(status==14)
        {
            c1.changeFinalVerdict(claimid,1);
            tc1.unlockCN(coverid);
            succ = p2.sendClaimPayout(coverid,claimid);
        }
        if(status==15)
        {
            c1.changeFinalVerdict(claimid,-1);
            tc2.burnCNToken(coverid);
            if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
            {
                pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
                c1.checkLiquidity(curr);
            }
        }
    }
  
    /// @dev Reward the tokens to all the Claim Assessors who have participated in voting of given claim.
    /// @param claimid Claim Id.
    /// @param perc Reward Percentage.
    function rewardCAVoters(uint claimid,uint perc,bytes4 curr_name,uint sumAssured) internal
    {
        tc1=NXMToken(tokenAddress);
        tc2=NXMToken2(token2Address);
        cd=claimsData(claimsDataAddress);
        c1=claims(claimsAddress); 
        sumAssured=SafeMaths.mul(sumAssured,1000000000000000000);
        uint distributableTokens=SafeMaths.div(SafeMaths.mul(SafeMaths.mul(sumAssured,perc),1000000000000000000),(SafeMaths.mul(SafeMaths.mul(100,100),tc1.getTokenPrice(curr_name)))); //  1% of sum assured
        uint token;
        uint consesnsus_perc;
        uint accept=cd.getClaimVote(claimid,1);
        uint deny=cd.getClaimVote(claimid,-1);
        uint claimVoteLength=cd.getClaimVoteLength(claimid,1);
        for(uint i=0;i<claimVoteLength;i++)
        { 
            if(cd.getVoteVerdict(claimid,i,1)==1 )
            { 
                if(cd.getFinalVerdict(claimid)==1)
                {
                    token=SafeMaths.div(SafeMaths.mul(distributableTokens,cd.getVoteToken(claimid,i,1)),(accept));
                    tc2.rewardToken(cd.getVoteVoter(claimid,i,1),token);
                    cd.updateRewardCA(claimid,i,token);
                }
                else
                {
                    consesnsus_perc=SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny)));
                    if(consesnsus_perc>70)
                        consesnsus_perc=SafeMaths.sub(consesnsus_perc,70);

                    token = SafeMaths.div(cd.getVoteToken(claimid,i,1),10000000000);
                    tc2.extendCAWithAddress(cd.getVoteVoter(claimid,i,1),SafeMaths.mul(SafeMaths.mul(SafeMaths.mul(consesnsus_perc,12),60),60),token);
                }
            }
            else if(cd.getVoteVerdict(claimid,i,1)==-1)
            {
                if(cd.getFinalVerdict(claimid)==-1)
                {
                    token=SafeMaths.mul(distributableTokens,SafeMaths.div(cd.getVoteToken(claimid,i,1),(deny)));
                    tc2.rewardToken(cd.getVoteVoter(claimid,i,1),token);
                    cd.updateRewardCA(claimid,i,token);
                }
                else
                {
                    consesnsus_perc=SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny)));
                    if(consesnsus_perc>70)
                        consesnsus_perc=SafeMaths.mul(SafeMaths.mul((SafeMaths.sub(consesnsus_perc,70)),12),3600);
                    else
                        consesnsus_perc=SafeMaths.mul(SafeMaths.mul(consesnsus_perc,12),3600);

                    token = SafeMaths.div(cd.getVoteToken(claimid,i,1),10000000000);
                    tc2.extendCAWithAddress(cd.getVoteVoter(claimid,i,1),consesnsus_perc,token);
                }
            }                 
        }            
    }
    /// @dev Reward the tokens to all the Members who have participated in voting of given claim.
    /// @param claimid Claim Id.
    /// @param perc Reward Percentage.
    function rewardMVoters(uint claimid,uint perc, bytes4 curr_name,uint sumAssured) internal
    {
        tc1=NXMToken(tokenAddress);
        tc2=NXMToken2(token2Address); 
        cd=claimsData(claimsDataAddress);
        uint tokenx1e18=tc1.getTokenPrice(curr_name);
        sumAssured=SafeMaths.mul(sumAssured,1000000000000000000);
        uint distributableTokens=SafeMaths.div(SafeMaths.mul(SafeMaths.mul(sumAssured,perc),1000000000000000000),(SafeMaths.mul(SafeMaths.mul(100,100),tokenx1e18)));
        uint token_re;
        uint accept=cd.getClaimMVote(claimid,1);
        uint deny=cd.getClaimMVote(claimid,-1);
        uint claimVoteLength=cd.getClaimVoteLength(claimid,0);
        for(uint i=0;i<claimVoteLength;i++)
        {
            address voter=cd.getVoteVoter(claimid,i,0);
            uint token=cd.getVoteToken(claimid,i,0);
            if(cd.getVoteVerdict(claimid,i,0)==1 )
            { 
                if(cd.getFinalVerdict(claimid)==1)
                {
                    token_re=SafeMaths.div(SafeMaths.mul(distributableTokens , token),(accept));
                    tc2.rewardToken(voter,token_re);
                    cd.updateRewardMV(claimid,i,token_re);
                }
            }
            else if(cd.getVoteVerdict(claimid,i,0)==-1)
            {
                if(cd.getFinalVerdict(claimid)==-1)
                {
                    token_re=SafeMaths.div(SafeMaths.mul(distributableTokens , token),(deny));
                    tc2.rewardToken(voter,token_re);
                    cd.updateRewardMV(claimid,i,token_re);
                }
            }        
        }     
    }

    /// @dev Start Voting of All Pending Claims when Emergency Pause OFF.
    function StartAllPendingClaimsVoting() onlyInternal
    {
        cd=claimsData(claimsDataAddress);
        p1=pool(poolAddress);
        tc1=NXMToken(tokenAddress);
        qd=quotationData(quotationDataAddress);
        uint firstIndx = cd.getFirstClaimIndexToStartVotingAfterEP();
        uint i;
        uint lengthOfClaimVotingPause=cd.getLengthOfClaimVotingPause();
        for (i=firstIndx; i<lengthOfClaimVotingPause;i++)
        {            
            uint pendingTime;
            uint ClaimID; 
            (ClaimID,pendingTime,)=cd.getPendingClaimDetailsByIndex(i);
            uint pTime=SafeMaths.add(SafeMaths.sub(now,cd.max_voting_time()),pendingTime);
            cd.setClaimdate_upd(ClaimID,pTime);
            cd.setPendingClaimVoteStatus(i,true);
            
            uint coverid=cd.getClaimCoverId(ClaimID);
            address qadd=qd.getCoverMemberAddress(coverid);
            tc1.DepositLockCN_EPOff(qadd,coverid,SafeMaths.add(pendingTime,cd.claimDepositTime()));
            p1.closeClaimsOraclise(ClaimID,uint64(pTime));
        }
        cd.setFirstClaimIndexToStartVotingAfterEP(i);
    }
}