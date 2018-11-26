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

pragma solidity 0.4.24;

import "./NXMToken.sol";
import "./TokenFunctions.sol";
import "./TokenController.sol";
import "./TokenData.sol";
import "./Claims.sol";
import "./ClaimsData.sol";
import "./Pool1.sol";
import "./Pool2.sol";
import "./Pool3.sol";
import "./PoolData.sol";
import "./QuotationData.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";


contract ClaimsReward is Iupgradable {
    using SafeMath for uint;

    NXMToken internal tk;
    TokenController internal tc;
    TokenFunctions internal tf;
    TokenData internal td;
    QuotationData internal qd;
    Claims internal c1;
    ClaimsData internal cd;
    Pool1 internal p1;
    Pool2 internal p2;
    Pool3 internal p3;
    PoolData internal pd;

    uint private constant DECIMAL1E18 = uint(10) ** 18;

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    modifier isMemberAndcheckPause {
        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }
  
    function changeDependentContractAddress() public onlyInternal {
        c1 = Claims(ms.getLatestAddress("CL"));
        cd = ClaimsData(ms.getLatestAddress("CD"));
        tk = NXMToken(ms.tokenAddress());
        tc = TokenController(ms.getLatestAddress("TC"));
        td = TokenData(ms.getLatestAddress("TD"));
        tf = TokenFunctions(ms.getLatestAddress("TF"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        p2 = Pool2(ms.getLatestAddress("P2"));
        p3 = Pool3(ms.getLatestAddress("P3"));
        pd = PoolData(ms.getLatestAddress("PD"));
        qd = QuotationData(ms.getLatestAddress("QD"));
    }

    /// @dev Decides the next course of action for a given claim.
    function changeClaimStatus(uint claimid) public checkPause onlyInternal {

        uint coverid;
        (, coverid) = cd.getClaimCoverId(claimid);

        uint status;
        (, status) = cd.getClaimStatusNumber(claimid);

        // when current status is "Pending-Claim Assessor Vote"
        if (status == 0) {
            changeClaimStatusCA(claimid, coverid, status);
        } else if (status >= 1 && status <= 5) { 
            changeClaimStatusMV(claimid, coverid, status);
        } else if (status == 12) { // when current status is "Claim Accepted Payout Pending"
            bool succ = p1.sendClaimPayout(coverid, claimid);
            if (succ) 
                c1.setClaimStatus(claimid, 14);
        }
        c1.changePendingClaimStart();
    }

    /// @dev Amount of tokens to be rewarded to a user for a particular vote id.
    /// @param check 1 -> CA vote, else member vote
    /// @param voteid vote id for which reward has to be Calculated
    /// @param flag if 1 calculate even if claimed,else don't calculate if already claimed
    /// @return tokenCalculated reward to be given for vote id
    /// @return lastClaimedCheck true if final verdict is still pending for that voteid
    /// @return tokens number of tokens locked under that voteid
    /// @return perc percentage of reward to be given.
    function getRewardToBeGiven(
        uint check,
        uint voteid,
        uint flag
    ) 
        public
        view
        returns (
            uint tokenCalculated,
            bool lastClaimedCheck,
            uint tokens,
            uint perc
        )

    {
        uint claimId;
        int8 verdict;
        bool claimed;
        uint tokensToBeDist;
        uint totalTokens;
        (tokens, claimId, verdict, claimed) = cd.getVoteDetails(voteid);
        lastClaimedCheck = false;
        if (cd.getFinalVerdict(claimId) == 0)
            lastClaimedCheck = true;
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
                    tokenCalculated = (perc.mul(tokens).mul(tokensToBeDist)).div(totalTokens.mul(100));
                }
            }
        }
    }

    /// @dev Transfers all tokens held by contract to a new contract in case of upgrade.
    function upgrade(address _newAdd) public onlyInternal {
        uint amount = tk.balanceOf(address(this));
        if (amount > 0)
            require(tk.transfer(_newAdd, amount));
    }

    /// @dev Total reward in token due for claim by a user.
    /// @return total total number of tokens
    function getRewardToBeDistributedByUser(address _add) public view returns(uint total) {
        uint lengthVote = cd.getVoteAddressCALength(_add);
        uint lastIndexCA;
        uint lastIndexMV;
        uint tokenForVoteId;
        uint voteId;
        (lastIndexCA, lastIndexMV) = cd.getRewardDistributedIndex(_add);

        for (uint i = lastIndexCA; i < lengthVote; i++) {
            voteId = cd.getVoteAddressCA(_add, i);
            (tokenForVoteId, , , ) = getRewardToBeGiven(1, voteId, 0);
            total = total.add(tokenForVoteId);
        }

        lengthVote = cd.getVoteAddressMemberLength(_add);

        for (uint j = lastIndexMV; j < lengthVote; j++) {
            voteId = cd.getVoteAddressMember(_add, j);
            (tokenForVoteId, , , ) = getRewardToBeGiven(0, voteId, 0);
            total = total.add(tokenForVoteId);
        }
        return (total);
    }

    /// @dev Gets reward amount and claiming status for a given claim id.
    /// @return reward amount of tokens to user.
    /// @return claimed true if already claimed false if yet to be claimed.
    function getRewardAndClaimedStatus(uint check, uint claimId) public view returns(uint reward, bool claimed) {
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

    function claimAllPendingReward() public isMemberAndcheckPause {
        claimRewardToBeDistributed();
        claimStakeCommission(); 
    }

    function getAllPendingRewardOfUser(address _add) public view returns(uint total) {
        uint caReward = getRewardToBeDistributedByUser(_add);
        uint commissionEarned = td.getStakerTotalEarnedStakeCommission(_add);
        uint commissionReedmed = td.getStakerTotalReedmedStakeCommission(_add);
        total = caReward.add(commissionEarned).sub(commissionReedmed);
    }

    /// @dev Rewards/Punishes users who  participated in Claims assessment.
    //             Unlocking and burning of the tokens will also depend upon the status of claim.
    /// @param claimid Claim Id.
    function rewardAgainstClaim(uint claimid, uint coverid, uint status) internal {
        bytes4 curr = qd.getCurrencyOfCover(coverid);
        uint64 sumAssured = uint64(qd.getCoverSumAssured(coverid));
        uint currPrice = tf.getTokenPrice(curr);
        uint distributableTokens = (DECIMAL1E18.mul(DECIMAL1E18).mul(sumAssured)).
            div(currPrice.mul(100));            //  1% of sum assured
            
        uint percCA;
        uint percMV;

        (percCA, percMV) = c1.getRewardStatus(status);
        cd.setClaimRewardDetail(claimid, percCA, percMV, distributableTokens);
        if (percCA > 0 || percMV > 0) {
            tc.mint(address(this), distributableTokens);
        }

        if (status == 6 || status == 9 || status == 11) {
            cd.changeFinalVerdict(claimid, -1);
            td.setDepositCN(coverid, false); // Unset flag
            tf.burnDepositCN(coverid); // burn Deposited CN
            if (sumAssured <= pd.getCurrencyAssetVarMin(curr)) {
                pd.changeCurrencyAssetVarMin(curr, uint64(uint(pd.getCurrencyAssetVarMin(curr)).sub(sumAssured)));
                p3.checkLiquidityCreateOrder(curr);
            }
        } else if (status == 7 || status == 8 || status == 10) {
            cd.changeFinalVerdict(claimid, 1);
            td.setDepositCN(coverid, false); // Unset flag
            require(p1.sendClaimPayout(coverid, claimid)); //send payout
        } 
    }

    /// @dev Computes the result of Claim Assessors Voting for a given claim id.
    function changeClaimStatusCA(uint claimid, uint coverid, uint status) internal {
        // Check if voting should be closed or not
        if (c1.checkVoteClosing(claimid) == 1) {
            uint caTokens = c1.getCATokens(claimid, 0);
            uint accept;
            uint deny;
            uint acceptAndDeny;
            bool rewardOrPunish;
            (, accept) = cd.getClaimVote(claimid, 1);
            (, deny) = cd.getClaimVote(claimid, -1);
            acceptAndDeny = accept.add(deny);
            accept = accept.mul(100);
            deny = deny.mul(100);

            if (caTokens == 0) {
                status = 3;
            } else {
                uint sumassured = qd.getCoverSumAssured(coverid);
                // Min threshold reached tokens used for voting > 5* sum assured 
                if (caTokens > sumassured.mul(DECIMAL1E18).mul(5)) {

                    if (accept.div(acceptAndDeny) > 70) {
                        status = 7;
                        qd.changeCoverStatusNo(coverid, 1);
                        rewardOrPunish = true;
                    } else if (deny.div(acceptAndDeny) > 70) {
                        status = 6;
                        qd.changeCoverStatusNo(coverid, 2);
                        rewardOrPunish = true;
                    } else if (accept.div(acceptAndDeny) > deny.div(acceptAndDeny)) {
                        status = 4;
                    } else {
                        status = 5;
                    }

                } else {

                    if (accept.div(acceptAndDeny) > deny.div(acceptAndDeny)) {
                        status = 2;
                    } else {
                        status = 3;
                    }
                }
            }

            c1.setClaimStatus(claimid, status);

            if (rewardOrPunish)
                rewardAgainstClaim(claimid, coverid, status);
        }
    }

    /// @dev Computes the result of Member Voting for a given claim id.
    function changeClaimStatusMV(uint claimid, uint coverid, uint status) internal {

        // Check if voting should be closed or not
        if (c1.checkVoteClosing(claimid) == 1) {
            uint8 coverStatus;
            uint statusOrig = status;
            uint mvTokens = c1.getCATokens(claimid, 1);

            // If tokens used for acceptance >50%, claim is accepted
            uint sumassured = qd.getCoverSumAssured(coverid);
            uint thresholdUnreached = 0;
            // Minimum threshold for member voting is reached only when 
            // value of tokens used for voting > 5* sum assured of claim id
            if (mvTokens < sumassured.mul(DECIMAL1E18).mul(5))
                thresholdUnreached = 1;
            uint accept;
            (, accept) = cd.getClaimMVote(claimid, 1);
            uint deny;
            (, deny) = cd.getClaimMVote(claimid, -1);
            if (accept.add(deny) > 0) {
                if (accept.mul(100).div(accept.add(deny)) >= 50 && statusOrig > 1 && 
                    statusOrig <= 5 && thresholdUnreached == 0) {
                    status = 8;
                    coverStatus = 1;
                } else if (deny.mul(100).div(accept.add(deny)) > 50 && statusOrig > 1 &&
                    statusOrig <= 5 && thresholdUnreached == 0) {
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
            // Reward/Punish Claim Assessors and Members who participated in Claims assessment
            rewardAgainstClaim(claimid, coverid, status);
        }
    }

    /// @dev Allows a user to claim all pending  Claims assessment rewards.
    function claimRewardToBeDistributed() internal {
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

            if (perc > 0 && !claimed) {
                counter++;
                cd.setRewardClaimed(voteid, true);
            } else if (perc == 0 && cd.getFinalVerdict(claimId) != 0 && !claimed) {
                counter++;
                cd.setRewardClaimed(voteid, true);
            }
            if (tokenForVoteId > 0)
                total = tokenForVoteId.add(total);
        }
        cd.setRewardDistributedIndexCA(msg.sender, lastClaimed);
        lengthVote = cd.getVoteAddressMemberLength(msg.sender);
        lastClaimed = lengthVote;
        _days = _days.mul(counter);
        if (tc.tokensLockedAtTime(msg.sender, "CLA", now) > 0)
            tc.reduceLock(msg.sender, "CLA", _days);
        for (i = lastIndexMV; i < lengthVote; i++) {
            voteid = cd.getVoteAddressMember(msg.sender, i);
            (tokenForVoteId, lastClaimedCheck, , ) = getRewardToBeGiven(0, voteid, 0);
            if (lastClaimed == lengthVote && lastClaimedCheck == true)
                lastClaimed = i;
            (, claimId, , claimed) = cd.getVoteDetails(voteid);
            if (claimed == false && cd.getFinalVerdict(claimId) != 0)
                cd.setRewardClaimed(voteid, true);
            if (tokenForVoteId > 0)
                total = tokenForVoteId.add(total);
        }
        if (total > 0)
            require(tk.transfer(msg.sender, total)); 
        cd.setRewardDistributedIndexMV(msg.sender, lastClaimed);
    }

    function claimStakeCommission() internal {
        uint total=0;
        uint len = td.getStakerStakedContractLength(msg.sender);
        uint lastCompletedStakeCommission = td.lastCompletedStakeCommission(msg.sender);
        uint commissionEarned;
        uint commissionRedeemed;
        uint maxCommission;
        for (uint i = lastCompletedStakeCommission; i < len; i++) {
            commissionRedeemed = td.getStakerRedeemedStakeCommission(msg.sender, i);
            commissionEarned = td.getStakerEarnedStakeCommission(msg.sender, i);
            maxCommission = td.getStakerInitialStakedAmountOnContract(msg.sender, i).mul(50).div(100);
            if (maxCommission == commissionEarned.sub(commissionRedeemed))
                td.setLastCompletedStakeCommissionIndex(msg.sender, i); 
            td.pushRedeemedStakeCommissions(msg.sender, i, commissionEarned.sub(commissionRedeemed));
            total = total.add(commissionEarned.sub(commissionRedeemed));
        }

        if (total > 0) 
            require(tk.transfer(msg.sender, total)); //solhint-disable-line
    }
}
