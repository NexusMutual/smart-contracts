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

//Claims Reward Contract contains the functions for calculating number of tokens  
// that will get rewarded, unlocked or burned depending upon the status of claim.   

pragma solidity ^0.4.11;
import "./claims.sol";
import "./claimsData.sol";
import "./nxmToken.sol";
import "./nxmToken2.sol";
import "./nxmTokenData.sol";
import "./pool.sol";
import "./pool2.sol";
import "./poolData.sol";
import "./quotationData.sol";
import "./master.sol";
import "./Iupgradable.sol";
import "./pool3.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract claimsReward is Iupgradable {
    
    using SafeMaths
    for uint;

    nxmToken tc1;
    nxmToken2 tc2;
    nxmTokenData td;
    quotationData qd;
    claimsData cd;
    poolData pd;
    master ms;
    claims c1;
    pool p1;
    pool2 p2;
    pool3 p3;

    address public masterAddress;
    uint64 private constant DECIMAL1E18 = 1000000000000000000;

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

    modifier onlyInternal {

        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    function changeDependentContractAddress() onlyInternal {
        uint currentVersion = ms.currentVersion();
        c1 = claims(ms.versionContractAddress(currentVersion, "C1"));
        tc2 = nxmToken2(ms.versionContractAddress(currentVersion, "TOK2"));
        p1 = pool(ms.versionContractAddress(currentVersion, "P1"));
        cd = claimsData(ms.versionContractAddress(currentVersion, "CD"));
        tc1 = nxmToken(ms.versionContractAddress(currentVersion, "TOK1"));
        qd = quotationData(ms.versionContractAddress(currentVersion, "QD"));
        pd = poolData(ms.versionContractAddress(currentVersion, "PD"));
        p2 = pool2(ms.versionContractAddress(currentVersion, "P2"));
        p3 = pool3(ms.versionContractAddress(currentVersion, "P3"));
        td = nxmTokenData(ms.versionContractAddress(currentVersion, "TD"));

    }
   
    /// @dev Depending upon the current status of the claim, corresponding functions are called and next status of the claim is decided accordingly.
    function changeClaimStatus(uint claimid) checkPause {

        require(ms.isInternal(msg.sender) == true || ms.isOwner(msg.sender) == true);

        uint coverid;
        (, coverid) = cd.getClaimCoverId(claimid);

        uint8 status;
        (, status) = cd.getClaimStatusNumber(claimid);

        // when current status is "Pending-Claim Assessor Vote"
        if (status == 0) {
            changeClaimStatusCA(claimid, coverid, status);

        }else if (status >= 1 && status <= 5) {  // when current status is Pending-Claim Assessor Vote Denied, pending RM Escalation
            changeClaimStatusMV(claimid, coverid, status);
        }else if (status == 12) { // when current status is "Claim Accepted Payout Pending"
            bool succ = p2.sendClaimPayout(coverid, claimid);
            if (succ) {

                c1.setClaimStatus(claimid, 14);
            }
        }
        c1.changePendingClaimStart();
    }
    
    /// @dev Start Voting of All Pending Claims when Emergency Pause OFF.
    function startAllPendingClaimsVoting() onlyInternal {

        uint firstIndx = cd.getFirstClaimIndexToStartVotingAfterEP();
        uint i;
        uint lengthOfClaimVotingPause = cd.getLengthOfClaimVotingPause();
        for (i = firstIndx; i < lengthOfClaimVotingPause; i++) {
            uint pendingTime;
            uint claimID;
            (claimID, pendingTime, ) = cd.getPendingClaimDetailsByIndex(i);
            uint pTime = SafeMaths.add(SafeMaths.sub(now, cd.maxVotingTime()), pendingTime);
            cd.setClaimdateUpd(claimID, pTime);
            cd.setPendingClaimVoteStatus(i, true);

            uint coverid;
            (, coverid) = cd.getClaimCoverId(claimID);
            address qadd = qd.getCoverMemberAddress(coverid);
            tc1.depositLockCNEPOff(qadd, coverid, SafeMaths.add(pendingTime, cd.claimDepositTime()));
            p1.closeClaimsOraclise(claimID, uint64(pTime));
        }
        cd.setFirstClaimIndexToStartVotingAfterEP(i);
    }

    /// @dev Amount of tokens should be given to user for particular vote id.
    /// @param check if 1 CA vote,else member vote
    /// @param voteid vote id for which rewardhas to be Calculated
    /// @param flag if 1 calculate even if claimed,else don't calculate if already claimed
    /// @return tokenCalculated reward to be given for vote id
    /// @return lastClaimedCheck true if fibal verdict is still pending for that voteid
    /// @return tokens number of tokens locked under that voteid
    /// @return perc percentage of reward to be given.
    function getRewardToBeGiven(uint check, uint voteid, uint flag) 
    constant 
    returns(
        uint tokenCalculated, 
        bool lastClaimedCheck, 
        uint tokens, 
        uint perc
        ) {

        uint claimId;
        int8 verdict;
        bool claimed;
        uint tokensToBeDist;
        uint totalTokens;
        (tokens, claimId, verdict, claimed) = cd.getVoteDetails(voteid);
        lastClaimedCheck = false;
        if (cd.getFinalVerdict(claimId) == 0) lastClaimedCheck = true;
        int8 claimVerdict = cd.getFinalVerdict(claimId);
        if (claimVerdict == verdict && (claimed == false || flag == 1)) {
            if (check == 1)
                (perc, , tokensToBeDist) = cd.getClaimRewardDetail(claimId);
            else
                (, perc, tokensToBeDist) = cd.getClaimRewardDetail(claimId);

            if (perc > 0) {

                if (check == 1) {
                    if (verdict == 1) {
                        (, totalTokens, ) = cd.getClaimsTokenCA(claimId);
                    }else if (verdict == -1) {
                        (, , totalTokens) = cd.getClaimsTokenCA(claimId);
                    }
                } else {
                    if (verdict == 1) {
                        (, totalTokens, ) = cd.getClaimsTokenMV(claimId);
                    }else if (verdict == -1) {
                        (, , totalTokens) = cd.getClaimsTokenMV(claimId);
                    }
                }

                if (totalTokens > 0) {

                    tokenCalculated = SafeMaths.div(SafeMaths.mul(perc, SafeMaths.mul(tokens, tokensToBeDist)), SafeMaths.mul(100, totalTokens));
                }
            }
        }

    }

    /// @dev To Claim the reward by user.
    function claimRewardToBeDistributed() checkPause {
        uint lengthVote = cd.getVoteAddressCALength(msg.sender);
        uint lastIndexCA;
        uint lastIndexMV;
        uint voteid;
        (lastIndexCA, lastIndexMV) = cd.getRewardDistributedIndex(msg.sender);
        uint total = 0;
        uint lastClaimed = lengthVote;
        uint tokenForVoteId = 0;
        bool lastClaimedCheck;
        uint _days = td.lockCADays();
        bool claimed;
        uint counter = 0;
        uint claimId;
        uint perc;
        uint i;
        for (i = lastIndexCA; i < lengthVote; i++) {
            voteid = cd.getVoteAddressCA(msg.sender, i);
            (tokenForVoteId, lastClaimedCheck, , perc) = getRewardToBeGiven(1, voteid, 0);
            if (lastClaimed == lengthVote && lastClaimedCheck == true)
                lastClaimed = i;
            (, claimId, , claimed) = cd.getVoteDetails(voteid);

            if (perc > 0) {
                counter++;
                cd.setRewardClaimed(voteid, true);
            } else if (perc == 0 && cd.getFinalVerdict(claimId) != 0) {
                counter++;
                cd.setRewardClaimed(voteid, true);
            }
            if (tokenForVoteId > 0)
                total = SafeMaths.add(tokenForVoteId, total);
        }
        cd.setRewardDistributedIndexCA(msg.sender, lastClaimed);
        lengthVote = cd.getVoteAddressMemberLength(msg.sender);
        lastClaimed = lengthVote;
        _days = SafeMaths.mul(_days, counter);
        tc1.reduceLock("CLA", msg.sender, _days);
        for (i = lastIndexMV; i < lengthVote; i++) {
            voteid = cd.getVoteAddressMember(msg.sender, i);
            (tokenForVoteId, lastClaimedCheck, , ) = getRewardToBeGiven(0, voteid, 0);
            if (lastClaimed == lengthVote && lastClaimedCheck == true)
                lastClaimed = i;
            (, claimId, , claimed) = cd.getVoteDetails(voteid);
            if (claimed == false && cd.getFinalVerdict(claimId) != 0)
                cd.setRewardClaimed(voteid, true);
            if (tokenForVoteId > 0)
                total = SafeMaths.add(tokenForVoteId, total);
        }
        if (total > 0)
            tc1.transfer(msg.sender, total);
        cd.setRewardDistributedIndexMV(msg.sender, lastClaimed);

    }
    
    function upgrade(address _newAdd) onlyInternal {
        uint amount = tc1.balanceOf(address(this));
        if (amount > 0)
            tc1.transfer(_newAdd, amount);
    }

    /// @dev Total Amount of tokens should be given to user.
    /// @return total total number of tokens
    function getRewardToBeDistributedByUser() constant returns(uint total) {
        uint lengthVote = cd.getVoteAddressCALength(msg.sender);
        uint lastIndexCA;
        uint lastIndexMV;
        uint tokenForVoteId;
        uint voteId;
        (lastIndexCA, lastIndexMV) = cd.getRewardDistributedIndex(msg.sender);
        for (uint i = lastIndexCA; i < lengthVote; i++) {
            voteId = cd.getVoteAddressCA(msg.sender, i);
            (tokenForVoteId, , , ) = getRewardToBeGiven(1, voteId, 0);
            total = SafeMaths.add(total, tokenForVoteId);
        }
        lengthVote = cd.getVoteAddressMemberLength(msg.sender);
        for (uint j = lastIndexMV; j < lengthVote; j++) {
            voteId = cd.getVoteAddressMember(msg.sender, j);
            (tokenForVoteId, , , ) = getRewardToBeGiven(0, voteId, 0);
            total = SafeMaths.add(total, tokenForVoteId);
        }
        return (total);
    }

    /// @dev Reawad amount and claiming status.
    /// @return reward amount of tokens to user.
    /// @return claimed true if already claimed false if yet to be claimed.
    function getRewardAndClaimedStatus(uint check, uint claimId) constant returns(uint reward, bool claimed) {
        uint voteId;
        uint claimid;
        if (check == 1) {
            uint lengthVote = cd.getVoteAddressCALength(msg.sender);
            for (uint i = 0; i < lengthVote; i++) {
                voteId = cd.getVoteAddressCA(msg.sender, i);
                (, claimid, , claimed) = cd.getVoteDetails(voteId);
                if (claimid == claimId) break;
            }
        } else {
            lengthVote = cd.getVoteAddressMemberLength(msg.sender);
            for (uint j = 0; j < lengthVote; j++) {
                voteId = cd.getVoteAddressMember(msg.sender, j);
                (, claimid, , claimed) = cd.getVoteDetails(voteId);
                if (claimid == claimId) break;
            }
        }
        (reward, , , ) = getRewardToBeGiven(check, voteId, 1);

    }

    /// @dev Rewards/Punishes users who  participated in claims assessment. 
    //             Unlocking and burning of the tokens will also depend upon the status of claim.
    /// @param claimid Claim Id.
    function rewardAgainstClaim(uint claimid, uint coverid, uint8 status) internal {
        bool succ;
        bytes4 curr = qd.getCurrencyOfCover(coverid);
        uint64 sumAssured = uint64(qd.getCoverSumAssured(coverid));
        uint currPrice = tc1.getTokenPrice(curr);
        uint distributableTokens = SafeMaths.div(
            SafeMaths.mul(
                SafeMaths.mul(sumAssured, DECIMAL1E18), DECIMAL1E18), 
            SafeMaths.mul(currPrice, 100)); //  1% of sum assured
        uint percCA;
        uint percMV;
        (percCA, percMV) = c1.getRewardStatus(status);
        cd.setClaimRewardDetail(claimid, percCA, percMV, distributableTokens);
        if (percCA > 0 || percMV > 0) {
            tc2.mintClaimRewardToken(distributableTokens);
        }
        if (status == 6) {  // Final-Claim Assessor Vote Denied
            cd.changeFinalVerdict(claimid, -1);
            // Rewards Claims Assessor only
            tc2.burnCNToken(coverid); // Burns tokens deposited at the time of claim submission
            if (sumAssured <= pd.getCurrencyAssetVarMin(curr)) {
                pd.changeCurrencyAssetVarMin(curr, SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr), sumAssured));
                p3.checkLiquidityCreateOrder(curr);
            }
        }
        if (status == 7) {
            cd.changeFinalVerdict(claimid, 1);
            // Rewards Claims Assessor only
            tc1.unlockCN(coverid); // Unlocks token locked against cover note
            succ = p2.sendClaimPayout(coverid, claimid); //Initiates payout
        }
        if (status == 8) {
            cd.changeFinalVerdict(claimid, 1);
            tc1.unlockCN(coverid);
            succ = p2.sendClaimPayout(coverid, claimid);
        }
        if (status == 9) {
            cd.changeFinalVerdict(claimid, -1);
            tc2.burnCNToken(coverid);
            if (sumAssured <= pd.getCurrencyAssetVarMin(curr)) {
                pd.changeCurrencyAssetVarMin(curr, SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr), sumAssured));
                p3.checkLiquidityCreateOrder(curr);
            }
        }
        if (status == 10) {
            cd.changeFinalVerdict(claimid, 1);
            tc1.unlockCN(coverid);
            succ = p2.sendClaimPayout(coverid, claimid);
        }
        if (status == 11) {
            cd.changeFinalVerdict(claimid, -1);
            tc2.burnCNToken(coverid);
            if (sumAssured <= pd.getCurrencyAssetVarMin(curr)) {
                pd.changeCurrencyAssetVarMin(curr, SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr), sumAssured));
                p3.checkLiquidityCreateOrder(curr);
            }
        }
    }

    /// @dev Computes the result of Claim Assessors Voting for a given claim id.
    function changeClaimStatusCA(uint claimid, uint coverid, uint8 status) internal {

        // Check if voting should be closed or not
        if (c1.checkVoteClosing(claimid) == 1) {
            uint caTokens = c1.getCATokens(claimid, 0);
            uint rewardClaim = 0;
            if (caTokens == 0) {

                status = 3;
            } else {
                uint sumassured = qd.getCoverSumAssured(coverid);
                uint thresholdUnreached = 0;
                // Minimum threshold for CA voting is reached only when value of tokens used for voting > 5* sum assured of claim id
                if (caTokens < SafeMaths.mul(SafeMaths.mul(5, sumassured), DECIMAL1E18))
                    thresholdUnreached = 1;

                uint accept;
                (, accept) = cd.getClaimVote(claimid, 1);
                uint deny;
                (, deny) = cd.getClaimVote(claimid, -1);

                if (SafeMaths.div(SafeMaths.mul(accept, 100), (SafeMaths.add(accept, deny))) > 70 && thresholdUnreached == 0) {

                    status = 7;
                    qd.changeCoverStatusNo(coverid, 1);

                    // Call API of pool
                    rewardClaim = 1;
                } else if (SafeMaths.div(SafeMaths.mul(deny, 100), (SafeMaths.add(accept, deny))) > 70 && thresholdUnreached == 0) {
                    status = 6;
                    rewardClaim = 1;
                    qd.changeCoverStatusNo(coverid, 2);

                } else if (SafeMaths.div(SafeMaths.mul(deny, 100),
                            (SafeMaths.add(accept, deny))) > SafeMaths.div(SafeMaths.mul(accept, 100),
                            (SafeMaths.add(accept, deny))) && thresholdUnreached == 0) {
                    status = 5;
                }else if (SafeMaths.div(SafeMaths.mul(deny, 100), 
                            (SafeMaths.add(accept, deny))) <= SafeMaths.div(SafeMaths.mul(accept, 100), 
                            (SafeMaths.add(accept, deny))) && thresholdUnreached == 0) {
                    status = 4;
                }else if (SafeMaths.div(SafeMaths.mul(deny, 100), 
                            (SafeMaths.add(accept, deny))) > SafeMaths.div(SafeMaths.mul(accept, 100), 
                            (SafeMaths.add(accept, deny))) && thresholdUnreached == 1) {
                    status = 3;
                }else if (SafeMaths.div(SafeMaths.mul(deny, 100), 
                            (SafeMaths.add(accept, deny))) <= SafeMaths.div(SafeMaths.mul(accept, 100), 
                            (SafeMaths.add(accept, deny))) && thresholdUnreached == 1) {
                    status = 2;
                }
            }
            c1.setClaimStatus(claimid, status);
            if (rewardClaim == 1)
                rewardAgainstClaim(claimid, coverid, status);
        }
    }

    /// @dev Computes the result of Member Voting for a given claim id.
    function changeClaimStatusMV(uint claimid, uint coverid, uint8 status) internal {

        // Check if voting should be closed or not 
        if (c1.checkVoteClosing(claimid) == 1) {
            uint8 coverStatus;
            uint8 statusOrig = status;
            uint mvTokens = c1.getCATokens(claimid, 1);

            // If tokens used for acceptance >50%, claim is accepted
            uint sumassured = qd.getCoverSumAssured(coverid);
            uint thresholdUnreached = 0;
            // Minimum threshold for member voting is reached only when value of tokens used for voting > 5* sum assured of claim id
            if (mvTokens < SafeMaths.mul(SafeMaths.mul(5, sumassured), DECIMAL1E18))
                thresholdUnreached = 1;
            uint accept;
            (, accept) = cd.getClaimMVote(claimid, 1);
            uint deny;
            (, deny) = cd.getClaimMVote(claimid, -1);
            if (SafeMaths.add(accept, deny) > 0) {
                if (SafeMaths.div(SafeMaths.mul(accept, 100), 
                    (SafeMaths.add(accept, deny))) >= 50 && statusOrig > 1 && statusOrig <= 5 && thresholdUnreached == 0) {
                    status = 8;
                    coverStatus = 1;
                } else if (SafeMaths.div(SafeMaths.mul(deny, 100), 
                            (SafeMaths.add(accept, deny))) > 50 && statusOrig > 1 && statusOrig <= 5 && thresholdUnreached == 0) {
                    status = 9;
                    coverStatus = 2;
                }
            }
            if (thresholdUnreached == 1 && (statusOrig == 2 || statusOrig == 4)) {
                status = 10;
                coverStatus = 1;
            } else if (thresholdUnreached == 1 && (statusOrig == 5 || statusOrig == 3)) {
                status = 11;
                coverStatus = 2;
            }

            c1.setClaimStatus(claimid, status);
            qd.changeCoverStatusNo(coverid, coverStatus);
            // Reward/Punish Claim Assessors and Members who participated in claims assessment
            rewardAgainstClaim(claimid, coverid, status);
        }
    }
}