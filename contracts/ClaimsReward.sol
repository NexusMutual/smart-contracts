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

import "./NXMaster.sol";
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
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";


contract ClaimsReward is Iupgradable {
    using SafeMaths for uint;

    NXMaster ms;
    NXMToken tk;
    TokenController tc;
    TokenFunctions tf;
    TokenData td;
    QuotationData qd;
    Claims c1;
    ClaimsData cd;
    Pool1 p1;
    Pool2 p2;
    Pool3 p3;
    PoolData pd;

    uint64 private constant DECIMAL1E18 = 1000000000000000000;

    modifier onlyInternal {
        require(ms.isInternal(msg.sender) == true);
        _;
    }

    modifier checkPause {
        require(ms.isPause() == false);
        _;
    }

    modifier isMemberAndcheckPause {
        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    function changeMasterAddress(address _add) {
        if (address(ms) != address(0)) {
            require(ms.isInternal(msg.sender) == true);
        }
        ms = NXMaster(_add);
    }
    
    function changeDependentContractAddress() public onlyInternal {
        uint currentVersion = ms.currentVersion();
        c1 = Claims(ms.versionContractAddress(currentVersion, "C1"));
        cd = ClaimsData(ms.versionContractAddress(currentVersion, "CD"));
        tk = NXMToken(ms.versionContractAddress(currentVersion, "TK"));
        tc = TokenController(ms.versionContractAddress(currentVersion, "TC"));
        td = TokenData(ms.versionContractAddress(currentVersion, "TD"));
        tf = TokenFunctions(ms.versionContractAddress(currentVersion, "TF"));
        p1 = Pool1(ms.versionContractAddress(currentVersion, "P1"));
        p2 = Pool2(ms.versionContractAddress(currentVersion, "P2"));
        p3 = Pool3(ms.versionContractAddress(currentVersion, "P3"));
        pd = PoolData(ms.versionContractAddress(currentVersion, "PD"));
        qd = QuotationData(ms.versionContractAddress(currentVersion, "QD"));
    }

    /// @dev Decides the next course of action for a given claim.
    function changeClaimStatus(uint claimid) checkPause {

        require(ms.isInternal(msg.sender) == true || ms.isOwner(msg.sender) == true);

        uint coverid;
        (, coverid) = cd.getClaimCoverId(claimid);

        uint8 status;
        (, status) = cd.getClaimStatusNumber(claimid);

        // when current status is "Pending-Claim Assessor Vote"
        if (status == 0) {
            changeClaimStatusCA(claimid, coverid, status);
        } else if (status >= 1 && status <= 5) { 
            changeClaimStatusMV(claimid, coverid, status);
        } else if (status == 12) { // when current status is "Claim Accepted Payout Pending"
            bool succ = p2.sendClaimPayout(coverid, claimid);
            if (succ) {

                c1.setClaimStatus(claimid, 14);
            }
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
        constant
        returns
    (
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
                    tokenCalculated = SafeMaths.div(SafeMaths.mul(perc, SafeMaths.mul(tokens, tokensToBeDist)), SafeMaths.mul(100, totalTokens));
                }
            }
        }
    }

    /// @dev Transfers all tokens held by contract to a new contract in case of upgrade.
    function upgrade(address _newAdd) public onlyInternal {
        uint amount = tk.balanceOf(address(this));
        if (amount > 0)
            tk.transfer(_newAdd, amount);
    }

    /// @dev Total reward in token due for claim by a user.
    /// @return total total number of tokens
    function getRewardToBeDistributedByUser(address _add) constant returns(uint total) {
        uint lengthVote = cd.getVoteAddressCALength(_add);
        uint lastIndexCA;
        uint lastIndexMV;
        uint tokenForVoteId;
        uint voteId;
        (lastIndexCA, lastIndexMV) = cd.getRewardDistributedIndex(_add);

        for (uint i = lastIndexCA; i < lengthVote; i++) {
            voteId = cd.getVoteAddressCA(_add, i);
            (tokenForVoteId, , , ) = getRewardToBeGiven(1, voteId, 0);
            total = SafeMaths.add(total, tokenForVoteId);
        }

        lengthVote = cd.getVoteAddressMemberLength(_add);

        for (uint j = lastIndexMV; j < lengthVote; j++) {
            voteId = cd.getVoteAddressMember(_add, j);
            (tokenForVoteId, , , ) = getRewardToBeGiven(0, voteId, 0);
            total = SafeMaths.add(total, tokenForVoteId);
        }
        return (total);
    }

    /// @dev Gets reward amount and claiming status for a given claim id.
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

    function getTotalStakeCommission(address _add) public returns(uint total) {
        total = 0;
        address scAdd;
        uint len = td.getStakerStakedContractLength(_add);
        uint commissionLen;
        uint lastClaimedCommission;
        uint commissionAmt;
        bool claimed;

        for (uint i = 0; i < len; i++) {

            scAdd = td.getStakerStakedContractByIndex(_add, i);
            commissionLen = td.getStakeCommissionLength(_add, scAdd, i);
            lastClaimedCommission = td.getLastClaimedCommission(_add, scAdd, i);

            for (uint j = lastClaimedCommission; j < commissionLen; j++) {
                (, , commissionAmt, , claimed) = td.getStakeCommission(_add, scAdd, i, j);
                if (!claimed) {
                    total = total.add(commissionAmt);
                }
            }
        }
    }

    function claimAllPendingReward() public isMemberAndcheckPause {
        claimRewardToBeDistributed();
        claimStakeCommission();
    }

    function getAllPendingRewardOfUser(address _add) constant returns(uint total) {
        uint caReward = getRewardToBeDistributedByUser(_add);
        uint stakeCommission = getTotalStakeCommission(_add);
        total = SafeMaths.add(caReward, stakeCommission);
    }

    /// @dev Rewards/Punishes users who  participated in Claims assessment.
    //             Unlocking and burning of the tokens will also depend upon the status of claim.
    /// @param claimid Claim Id.
    function rewardAgainstClaim(uint claimid, uint coverid, uint8 status) internal {
        bytes4 curr = qd.getCurrencyOfCover(coverid);
        uint64 sumAssured = uint64(qd.getCoverSumAssured(coverid));
        uint currPrice = tf.getTokenPrice(curr);
        uint distributableTokens = SafeMaths.div(
            SafeMaths.mul(
                SafeMaths.mul(sumAssured, DECIMAL1E18), DECIMAL1E18),
            SafeMaths.mul(currPrice, 100)); //  1% of sum assured
        uint percCA;
        uint percMV;
        (percCA, percMV) = c1.getRewardStatus(status);
        cd.setClaimRewardDetail(claimid, percCA, percMV, distributableTokens);
        if (percCA > 0 || percMV > 0) {
            tc.mint(address(this), distributableTokens);
        }

        if (status == 6 || status == 9 || status == 11) {
            cd.changeFinalVerdict(claimid, -1);
            tf.undepositCN(coverid, true); // Unset flag and add covernote to burns
            if (sumAssured <= pd.getCurrencyAssetVarMin(curr)) {
                pd.changeCurrencyAssetVarMin(curr, SafeMaths.sub64(pd.getCurrencyAssetVarMin(curr), sumAssured));
                p3.checkLiquidityCreateOrder(curr);
            }
        } else if (status == 7 || status == 8 || status == 10) {
            cd.changeFinalVerdict(claimid, 1);
            tf.undepositCN(coverid, false); // Unset flag and does not add covernote to burns
            require(p2.sendClaimPayout(coverid, claimid)); //send payout
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
                    // Call API of Pool
                    rewardClaim = 1;
                } else if (SafeMaths.div(SafeMaths.mul(deny, 100), (SafeMaths.add(accept, deny))) > 70 && thresholdUnreached == 0) {
                    status = 6;
                    rewardClaim = 1;
                    qd.changeCoverStatusNo(coverid, 2);

                } else if (SafeMaths.div(SafeMaths.mul(deny, 100),
                            (SafeMaths.add(accept, deny))) > SafeMaths.div(SafeMaths.mul(accept, 100),
                            (SafeMaths.add(accept, deny))) && thresholdUnreached == 0) {
                    status = 5;
                } else if (SafeMaths.div(SafeMaths.mul(deny, 100),
                            (SafeMaths.add(accept, deny))) <= SafeMaths.div(SafeMaths.mul(accept, 100),
                            (SafeMaths.add(accept, deny))) && thresholdUnreached == 0) {
                    status = 4;
                } else if (SafeMaths.div(SafeMaths.mul(deny, 100),
                            (SafeMaths.add(accept, deny))) > SafeMaths.div(SafeMaths.mul(accept, 100),
                            (SafeMaths.add(accept, deny))) && thresholdUnreached == 1) {
                    status = 3;
                } else if (SafeMaths.div(SafeMaths.mul(deny, 100),
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
                total = SafeMaths.add(tokenForVoteId, total);
        }
        cd.setRewardDistributedIndexCA(msg.sender, lastClaimed);
        lengthVote = cd.getVoteAddressMemberLength(msg.sender);
        lastClaimed = lengthVote;
        _days = SafeMaths.mul(_days, counter);
        if (tc.tokensLockedAtTime(msg.sender, "CLA", now) > 0)
            tc.reduceLockDuration(msg.sender, "CLA", _days);
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
            require(msg.sender.send(total)); //solhint-disable-line
        cd.setRewardDistributedIndexMV(msg.sender, lastClaimed);
    }

    function claimStakeCommission() internal {
        uint total=0;
        address scAdd;
        uint len = td.getStakerStakedContractLength(msg.sender);
        uint commissionLen;
        uint lastClaimedCommission;
        uint commissionAmt;
        bool claimed;
        for (uint i = 0; i < len; i++) {
            scAdd = td.getStakerStakedContractByIndex(msg.sender, i);
            commissionLen = td.getStakeCommissionLength(msg.sender, scAdd, i);
            lastClaimedCommission = td.getLastClaimedCommission(msg.sender, scAdd, i);
            for (uint j = lastClaimedCommission; j < commissionLen; j++) {
                (, , commissionAmt, , claimed) = td.getStakeCommission(msg.sender, scAdd, i, j);
                if (!claimed) {
                    total = total.add(commissionAmt);
                    td.setClaimedCommision(msg.sender, scAdd, i, j);
                }
            }
            td.setLastClaimedCommission(msg.sender, scAdd, i, commissionLen);
        }

        if (total > 0)
            require(msg.sender.send(total)); //solhint-disable-line
    }
}
