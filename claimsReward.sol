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
import "./claims.sol";
import "./claimsData.sol";
import "./nxmToken.sol";
import "./nxmToken2.sol";
import "./pool.sol";
import "./pool2.sol";
import "./poolData.sol";
import "./quotationData.sol";
import "./master.sol";
import "./SafeMaths.sol";
contract claimsReward
{ 
    using SafeMaths for uint;
    nxmToken tc1;
    nxmToken2 tc2;
    quotationData qd;
    claimsData cd;
    poolData pd;
    master ms;
    claims c1;
    pool p1;
    pool2 p2;
    
    address public masterAddress;
    // address public token2Address;
    // address public poolAddress;
    // address public tokenAddress;
    // address public quotationDataAddress;
    // address public claimsAddress;
    // address public pool2Address;
    // address public claimsDataAddress;
    // address public poolDataAddress;
    
    uint64 private constant _DECIMAL_1e18 = 1000000000000000000;
    uint40 private constant _DECIMAL_1e10 = 10000000000;
    
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
    modifier checkPause
    {
        // ms=master(masterAddress);
        require(ms.isPause()==false);
        _;
    }
    function changeToken2Address(address nxmToken2Address) onlyInternal
    {
        // nxmToken2Address = _add;
        tc2=nxmToken2(nxmToken2Address);
    }

    function changeClaimDataAddress(address claimsDataAddress) onlyInternal
    {
        // claimsDataAddress = _add;
        cd=claimsData(claimsDataAddress);
    }

    function changePoolAddress(address poolAddress) onlyInternal
    {
        // poolAddress = _add;
        p1=pool(poolAddress);
    }
    function changeTokenAddress(address nxmTokenAddress) onlyInternal
    {
        // nxmTokenAddress = _add;
        tc1=nxmToken(nxmTokenAddress);
    }
    function changeQuotationDataAddress(address quotationDataAddress) onlyInternal
    {
        // quotationDataAddress = _add;
        qd=quotationData(quotationDataAddress);
    }
    function changeClaimsAddress(address claimsAddress) onlyInternal
    {
        // claimsAddress = _add;
        c1=claims(claimsAddress);
    }
    function changePool2Address(address pool2Address) onlyInternal
    {
        // pool2Address=_add;
        p2=pool2(pool2Address);
    }
    function changePoolDataAddress(address poolDataAddress) onlyInternal
    {
        // poolDataAddress = _add;
        pd=poolData(poolDataAddress);
    }
   
    /// @dev Computes the result of Claim Assessors Voting for a given claim id.
    function changeClaimStatusCA(uint claimid, uint coverid,uint8 status) internal
    {
        
        // Check if voting should be closed or not
        if(c1.checkVoteClosing(claimid)==1)
        { 
            uint CATokens=c1.getCATokens(claimid,0);
            uint reward_claim=0;            
            if(CATokens==0)
            {
                // status=4;
                status=3;
            }
            else
            { 
                uint sumassured=qd.getCoverSumAssured(coverid);
                uint threshold_unreached=0;
                // Minimum threshold for CA voting is reached only when value of tokens used for voting > 5* sum assured of claim id
                if(CATokens<SafeMaths.mul(SafeMaths.mul(5,sumassured),_DECIMAL_1e18))
                    threshold_unreached=1;

                uint accept;
                (,accept)=cd.getClaimVote(claimid,1);
                uint deny;
                (,deny)=cd.getClaimVote(claimid,-1);
               
                if( SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) > 70 &&  threshold_unreached==0)
                {
                //   status=8;
                 status=7;
                   qd.changeCoverStatusNo(coverid,1);
                   
                   // Call API of pool
                   reward_claim=1;
                }
                //  to be checked
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > 70 &&  threshold_unreached==0)
                {
                    status=6;
                    reward_claim=1;
                     qd.changeCoverStatusNo(coverid,2);
                    
                }
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) &&  threshold_unreached==0)
                    // status=6;
                    status=5;
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) <= SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) &&  threshold_unreached==0)
                    // status=5;
                    status=4;
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) &&  threshold_unreached==1)
                    // status=4;
                    status=3;
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) <= SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) &&  threshold_unreached==1)
                    // status=3;
                    status=2;
            }
            c1.setClaimStatus(claimid,status);
            if(reward_claim==1)
                rewardAgainstClaim(claimid,coverid,status);
        }
    }

    /// @dev Computes the result of Member Voting for a given claim id.
    function changeClaimStatusMV(uint claimid,uint coverid,uint8 status) internal
    {
          
        // Check if voting should be closed or not 
        if(c1.checkVoteClosing(claimid)==1)
        { 
            uint8 coverStatus;
            uint8 status_orig=status;
            uint MVTokens=c1.getCATokens(claimid,1);
              
                // If tokens used for acceptance >50%, claim is accepted
                uint sumassured=qd.getCoverSumAssured(coverid);
                uint threshold_unreached=0;
                // Minimum threshold for member voting is reached only when value of tokens used for voting > 5* sum assured of claim id
                if(MVTokens<SafeMaths.mul(SafeMaths.mul(5,sumassured),_DECIMAL_1e18))
                    threshold_unreached=1;
                uint accept;
                (,accept)=cd.getClaimMVote(claimid,1);
                uint deny;
                (,deny)=cd.getClaimMVote(claimid,-1);
                if(SafeMaths.add(accept,deny)>0){
                if(SafeMaths.div(SafeMaths.mul(accept,100),(SafeMaths.add(accept,deny))) >= 50 &&  status_orig>1 && status_orig<=5 && threshold_unreached==0)
                { status=8; coverStatus=1;}
                else if(SafeMaths.div(SafeMaths.mul(deny,100),(SafeMaths.add(accept,deny))) > 50 &&  status_orig>1 && status_orig<=5 && threshold_unreached==0)
                { status=9;coverStatus=2;}
                }
                if(threshold_unreached==1 &&  (status_orig==2 || status_orig==4))
                { status=10; coverStatus=1;}
                else if(threshold_unreached==1 &&  (status_orig==5 || status_orig==3))
                { status=11; coverStatus=2;}

            c1.setClaimStatus(claimid,status);
            qd.changeCoverStatusNo(coverid,coverStatus);
            // Reward/Punish Claim Assessors and Members who participated in claims assessment
            rewardAgainstClaim(claimid,coverid,status);
        }
    }

    /// @dev Depending upon the current status of the claim, corresponding functions are called and next status of the claim is decided accordingly.
    function changeClaimStatus(uint claimid) checkPause
    {
        
        if(ms.isInternal(msg.sender) != true && ms.isOwner(msg.sender) != true) throw;
       
        uint coverid;
        (,coverid)=cd.getClaimCoverId(claimid);
        
        uint8 status;
        (,status)=cd.getClaimStatusNumber(claimid);
        
        // when current status is "Pending-Claim Assessor Vote"
        if(status==0)
        {
            changeClaimStatusCA(claimid,coverid,status);
           
        }
        // when current status is Pending-Claim Assessor Vote Denied, pending RM Escalation
        //  to be checked
        // else if(status==1)
        // {
        //     c1.setClaimStatus(claimid,7);
        //     qd.changeCoverStatusNo(coverid,2);
        //     rewardAgainstClaim(claimid,coverid,status);
        // }
        // when current status is between 2 and 6, i.e. "Pending Member Vote"
        // else if(status>=2 && status<=6)
        else if(status>=1 && status<=5)
        {
            changeClaimStatusMV(claimid,coverid,status);
        }
        // when current status is "Claim Accepted Payout Pending"
        // else if(status == 16)
        else if(status == 12)
        {
            bool succ = p2.sendClaimPayout(coverid,claimid);
            if(succ)
            {
                // c1.setClaimStatus(claimid,18);
                c1.setClaimStatus(claimid,14);
            }
        }
        c1.changePendingClaimStart();
    }
    /// @dev Rewards/Punishes users who  participated in claims assessment. Unlocking and burning of the tokens will also depend upon the status of claim.
    /// @param claimid Claim Id.
    function rewardAgainstClaim(uint claimid,uint coverid, uint8 status) internal
    {
        
        bool succ;
       
        bytes4 curr=qd.getCurrencyOfCover(coverid);
        uint64 sumAssured=uint64(qd.getCoverSumAssured(coverid));
        uint currPrice=tc1.getTokenPrice(curr);
        uint distributableTokens=SafeMaths.div(SafeMaths.mul(SafeMaths.mul(sumAssured,_DECIMAL_1e18),_DECIMAL_1e18),SafeMaths.mul(currPrice,100)); //  1% of sum assured
        uint percCA;
        uint percMV;
        (percCA,percMV)=c1.getRewardStatus(status);
        cd.setClaim_reward_detail(claimid,percCA,percMV,distributableTokens);
        
        tc2.mintClaimRewardToken(distributableTokens);
      

        // if(status==7) // Final-Claim Assessor Vote Denied
        if(status==6)
        {
            c1.changeFinalVerdict(claimid,-1);
            
            // penalizeCAVoters(claimid);  // Rewards Claims Assessor only
            tc2.burnCNToken(coverid); // Burns tokens deposited at the time of claim submission
            if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
            {
                pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
                c1.checkLiquidity(curr);
            }
        }
        // if(status==8)
        if(status==7)
        {
            c1.changeFinalVerdict(claimid,1);
            // penalizeCAVoters(claimid); // Rewards Claims Assessor only
            tc1.unlockCN(coverid); // Unlocks token locked against cover note
            succ = p2.sendClaimPayout(coverid,claimid); //Initiates payout
        }
        //  to be checked
        // if(status==9)
        // {
        //     c1.changeFinalVerdict(claimid,1);
        //     penalizeCAVoters(claimid);  // Distributes rewards between claims assessor and members who voted
            
        //     tc1.unlockCN(coverid);
        //     succ = p2.sendClaimPayout(coverid,claimid);
           
        // }
        // //  to be checked
        // if(status==10)
        // {
        //     c1.changeFinalVerdict(claimid,-1);
        //     penalizeCAVoters(claimid);
           
        //     tc2.burnCNToken(coverid);
           
        //     if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
        //     {
        //         pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
        //         c1.checkLiquidity(curr);
        //     }
        // }
        // //  to be checked
        // if(status==11)
        // {
        //     c1.changeFinalVerdict(claimid,-1);
            
        //     penalizeCAVoters(claimid);
        //     tc2.undepositCN(coverid,0);
        //     tc2.burnCNToken(coverid);
            
        //     if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
        //     {
        //         pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
        //         c1.checkLiquidity(curr);
        //     }
        // }
        // if(status==12)
        if(status==8)
        {
            c1.changeFinalVerdict(claimid,1);
            
            tc1.unlockCN(coverid);
            succ = p2.sendClaimPayout(coverid,claimid);
           
        }
        // if(status==13)
        if(status==9)
        {
            c1.changeFinalVerdict(claimid,-1);
            
            tc2.burnCNToken(coverid);
            if(sumAssured<=pd.getCurrencyAssetVarMin(curr))
            {
                pd.changeCurrencyAssetVarMin(curr,SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr),sumAssured));
                c1.checkLiquidity(curr);
            }
         }
        // if(status==14)
        if(status==10)
        {
            c1.changeFinalVerdict(claimid,1);
            tc1.unlockCN(coverid);
            succ = p2.sendClaimPayout(coverid,claimid);
        }
        // if(status==15)
        if(status==11)
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
  
    /// @dev Start Voting of All Pending Claims when Emergency Pause OFF.
    function StartAllPendingClaimsVoting() onlyInternal
    {
       
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
            
            uint coverid;
            (,coverid)=cd.getClaimCoverId(ClaimID);
            address qadd=qd.getCoverMemberAddress(coverid);
            tc1.DepositLockCN_EPOff(qadd,coverid,SafeMaths.add(pendingTime,cd.claimDepositTime()));
            p1.closeClaimsOraclise(ClaimID,uint64(pTime));
        }
        cd.setFirstClaimIndexToStartVotingAfterEP(i);
    }
    // Prem data start
    function getRewardToBeGiven(uint check,uint voteid,uint flag)constant returns(uint tokenCalculated,bool lastClaimedCheck,uint tokens,uint perc)
    {
        
        uint claimId;
        int8 verdict;
        bool claimed;
        uint tokensToBeDist;
        // uint perc;
        uint totalTokens;
        // (tokens,,,)=cd.getVoteDetails(voteid);
        (tokens,claimId,verdict,claimed)=cd.getVoteDetails(voteid);
        lastClaimedCheck=false;
         if(cd.getFinalVerdict(claimId)==0)lastClaimedCheck=true;
        int8 claimVerdict=cd.getFinalVerdict(claimId);
        if(claimVerdict==verdict && (claimed==false || flag==1))
        {
        
        if(check==1)
            (perc,,tokensToBeDist)= cd.getClaim_reward_detail(claimId);
        else 
            (,perc,tokensToBeDist)= cd.getClaim_reward_detail(claimId);
        
        if(perc>0){
            
        if(check==1){
             if(verdict==1)
                (,totalTokens,)=cd.getClaims_tokenCA(claimId);
            else if(verdict==-1)
                 (,,totalTokens)=cd.getClaims_tokenCA(claimId);
        }
        else{
            if(verdict==1)
                (,totalTokens,)=cd.getClaims_tokenMV(claimId);
            else if(verdict==-1)
                 (,,totalTokens)=cd.getClaims_tokenMV(claimId);
        }
        
        if(totalTokens>0){
           
            
        tokenCalculated=SafeMaths.div(SafeMaths.mul(perc,SafeMaths.mul(tokens,tokensToBeDist)),SafeMaths.mul(100,totalTokens));
        }
            
            
        }  
        }
                
    }
    function claimRewardToBeDistributed()checkPause
    {
        uint lengthCAVote=cd.get_vote_address_ca_length(msg.sender);
        uint lengthMVVote=cd.get_vote_address_member_length(msg.sender);
        uint lastIndexCA;
        uint lastIndexMV;
        uint  voteid;
        (lastIndexCA,lastIndexMV)=cd.getRewardDistributedIndex(msg.sender);
        uint total=0;
        uint lastClaimedCA=lengthCAVote;
        uint lastClaimedMV=lengthMVVote;
        uint tokenForVoteId=0;
        bool lastClaimedCheck;
        uint _days=tc1.getLockCADays();
        bool claimed;
        uint tokens=0;
        uint claimId;
        uint perc;
        uint i;
        // (lastClaimedCA,lastClaimedMV)=getRewardToBeDistributedByUser();
        for(i=lastIndexCA;i<lengthCAVote;i++)
        {
          voteid =cd.get_vote_address_ca(msg.sender,i);
          (tokenForVoteId,lastClaimedCheck,tokens,perc)=getRewardToBeGiven(1,voteid,0);
          if(lastClaimedCA==lengthCAVote && lastClaimedCheck==true)
          lastClaimedCA=i;
            (,claimId,,claimed)=cd.getVoteDetails(voteid);
            
            if(perc>0 && tokens>0){
            tc2.reduceCAWithAddress(msg.sender,_days,tokens);
            cd.setRewardClaimed(voteid,true);
            }
            else if(perc==0&&cd.getFinalVerdict(claimId)!=0)
            {
            tc2.reduceCAWithAddress(msg.sender,_days,tokens);
            cd.setRewardClaimed(voteid,true);
            }
            if(tokenForVoteId>0)
            total=SafeMaths.add(tokenForVoteId,total);
            
        }
        for(i=lastIndexMV;i<lengthMVVote;i++)
        {
           voteid =cd.get_vote_address_member(msg.sender,i);
           (tokenForVoteId,lastClaimedCheck,tokens,)=getRewardToBeGiven(0,voteid,0);
          if(lastClaimedMV==lengthMVVote && lastClaimedCheck==true)
          lastClaimedMV=i;
          (,claimId,,claimed)=cd.getVoteDetails(voteid);
            
            if(claimed==false && cd.getFinalVerdict(claimId)!=0)
            cd.setRewardClaimed(voteid,true);
            if(tokenForVoteId>0)
            total=SafeMaths.add(tokenForVoteId,total);
            
        }
        if(total>0)
        tc1.transfer(msg.sender,total);
        cd.setRewardDistributedIndex_CA(msg.sender,lastClaimedCA);
        cd.setRewardDistributedIndex_MV(msg.sender,lastClaimedMV);
        
    } 
    
    
    
    function getRewardToBeDistributedByUser()constant returns(uint total)
    {
        uint lengthCAVote=cd.get_vote_address_ca_length(msg.sender);
        uint lengthMVVote=cd.get_vote_address_member_length(msg.sender);
        uint lastIndexCA;
        uint lastIndexMV;
        uint tokenForVoteId;
        uint voteId;
        (lastIndexCA,lastIndexMV)=cd.getRewardDistributedIndex(msg.sender);
        for(uint i=lastIndexCA;i<lengthCAVote;i++)
        {
            voteId=cd.get_vote_address_ca(msg.sender,i);
            (tokenForVoteId,,,)=getRewardToBeGiven(1,voteId,0);
            total=SafeMaths.add(total,tokenForVoteId);
        }
        for(uint j=lastIndexMV;j<lengthMVVote;j++)
        {
            voteId=cd.get_vote_address_member(msg.sender,j);
            (tokenForVoteId,,,)=getRewardToBeGiven(0,voteId,0);
            total=SafeMaths.add(total,tokenForVoteId);
        }
        return (total);
    }
    function getRewardAndClaimedStatus(uint check,uint claimId)constant returns(uint reward,bool claimed)
    {
        uint voteId;
        uint lengthCAVote=cd.get_vote_address_ca_length(msg.sender);
        uint lengthMVVote=cd.get_vote_address_member_length(msg.sender);
        uint claimid;
        if(check==1){
        for(uint i=0;i<lengthCAVote;i++){
        voteId=cd.get_vote_address_ca(msg.sender,i);
        (,claimid,,claimed)=cd.getVoteDetails(voteId);
        if(claimid==claimId)break;
        }
       }
       else 
       {
        for(uint j=0;j<lengthMVVote;j++){
        voteId=cd.get_vote_address_member(msg.sender,j);
        (,claimid,,claimed)=cd.getVoteDetails(voteId);
        if(claimid==claimId)break;
        }
       }
     (reward,,,)= getRewardToBeGiven(check,voteId,1);
      
      }
    
    // function takeNXMBack(address _add)onlyInternal
    // {
    //     uint _bal=tc1.balanceOf(address(this));
    //     tc1.transfer(_add,_bal);
    // }
    // Prem data ends
}