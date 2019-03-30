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

import "./TokenFunctions.sol";
import "./ClaimsData.sol";


contract Claims is Iupgradable {
    using SafeMath for uint;

    
    TokenFunctions internal tf;
    NXMToken internal tk;
    TokenController internal tc;
    ClaimsReward internal cr;
    Pool1 internal p1;
    ClaimsData internal cd;
    TokenData internal td;
    PoolData internal pd;
    Pool2 internal p2;
    QuotationData internal qd;

    uint private constant DECIMAL1E18 = uint(10) ** 18;
    
    /**
     * @dev Sets the status of claim using claim id.
     * @param claimId claim id.
     * @param stat status to be set.
     */ 
    function setClaimStatus(uint claimId, uint stat) external onlyInternal {
        _setClaimStatus(claimId, stat);
    }

    /**
     * @dev Gets claim details of claim id = pending claim start + given index
     */ 
    function getClaimFromNewStart(
        uint index
    )
        external 
        view 
        returns (
            uint coverId,
            uint claimId,
            int8 voteCA,
            int8 voteMV,
            uint statusnumber
        ) 
    {
        (coverId, claimId, voteCA, voteMV, statusnumber) = cd.getClaimFromNewStart(index, msg.sender);
        // status = rewardStatus[statusnumber].claimStatusDesc;
    }

    /**
     * @dev Gets details of a claim submitted by the calling user, at a given index
     */
    function getUserClaimByIndex(
        uint index
    )
        external
        view 
        returns(
            uint status,
            uint coverId,
            uint claimId
        )
    {
        uint statusno;
        (statusno, coverId, claimId) = cd.getUserClaimByIndex(index, msg.sender);
        status = statusno;
    }

    /**
     * @dev Gets details of a given claim id.
     * @param _claimId Claim Id.
     * @return status Current status of claim id
     * @return finalVerdict Decision made on the claim, 1 -> acceptance, -1 -> denial
     * @return claimOwner Address through which claim is submitted
     * @return coverId Coverid associated with the claim id
     */
    function getClaimbyIndex(uint _claimId) external view returns (
        uint claimId,
        uint status,
        int8 finalVerdict,
        address claimOwner,
        uint coverId
    )
    {
        uint stat;
        claimId = _claimId;
        (, coverId, finalVerdict, stat, , ) = cd.getClaim(_claimId);
        claimOwner = qd.getCoverMemberAddress(coverId);
        status = stat;
    }

    /**
     * @dev Calculates total amount that has been used to assess a claim.
     * Computaion:Adds acceptCA(tokens used for voting in favor of a claim)
     * denyCA(tokens used for voting against a claim) *  current token price.
     * @param claimId Claim Id.
     * @param member Member type 0 -> Claim Assessors, else members.
     * @return tokens Total Amount used in Claims assessment.
     */ 
    function getCATokens(uint claimId, uint member) external view returns(uint tokens) {
        uint coverId;
        (, coverId) = cd.getClaimCoverId(claimId);
        bytes4 curr = qd.getCurrencyOfCover(coverId);
        uint tokenx1e18 = tf.getTokenPrice(curr);
        uint accept;
        uint deny;
        if (member == 0) {
            (, accept, deny) = cd.getClaimsTokenCA(claimId);
        } else {
            (, accept, deny) = cd.getClaimsTokenMV(claimId);
        }
        tokens = ((accept.add(deny)).mul(tokenx1e18)).div(DECIMAL1E18); // amount (not in tokens)
    }

    /**
     * Iupgradable Interface to update dependent contract address
     */
    function changeDependentContractAddress() public onlyInternal {
        tk = NXMToken(ms.tokenAddress());
        td = TokenData(ms.getLatestAddress("TD"));
        tf = TokenFunctions(ms.getLatestAddress("TF"));
        tc = TokenController(ms.getLatestAddress("TC"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        p2 = Pool2(ms.getLatestAddress("P2"));
        pd = PoolData(ms.getLatestAddress("PD"));
        cr = ClaimsReward(ms.getLatestAddress("CR"));
        cd = ClaimsData(ms.getLatestAddress("CD"));
        qd = QuotationData(ms.getLatestAddress("QD"));
    }

    /**
     * @dev Updates the pending claim start variable,
     * the lowest claim id with a pending decision/payout.
     */ 
    function changePendingClaimStart() public onlyInternal {

        uint origstat;
        uint state12Count;
        uint pendingClaimStart = cd.pendingClaimStart();
        uint actualClaimLength = cd.actualClaimLength();
        for (uint i = pendingClaimStart; i < actualClaimLength; i++) {
            (, , , origstat, , state12Count) = cd.getClaim(i);

            if (origstat > 5 && ((origstat != 12) || (origstat == 12 && state12Count >= 60)))
                cd.setpendingClaimStart(i);
            else
                break;
        }
    }

    /**
     * @dev Submits a claim for a given cover note.
     * Adds claim to queue incase of emergency pause else directly submits the claim.
     * @param coverId Cover Id.
     */ 
    function submitClaim(uint coverId) public {
        address qadd = qd.getCoverMemberAddress(coverId);
        require(qadd == msg.sender);
        uint8 cStatus;
        (, cStatus, , , ) = qd.getCoverDetailsByCoverID2(coverId);
        require(cStatus != uint8(QuotationData.CoverStatus.ClaimSubmitted), "Claim already submitted");
        require(cStatus != uint8(QuotationData.CoverStatus.CoverExpired), "Cover already expired");
        if (ms.isPause() == false) {
            _addClaim(coverId, now, qadd);
        } else {
            cd.setClaimAtEmergencyPause(coverId, now, false);
            qd.changeCoverStatusNo(coverId, uint8(QuotationData.CoverStatus.Requested));
        }
    }

    /**
     * @dev Submits the Claims queued once the emergency pause is switched off.
     */
    function submitClaimAfterEPOff() public onlyInternal {
        uint lengthOfClaimSubmittedAtEP = cd.getLengthOfClaimSubmittedAtEP();
        uint firstClaimIndexToSubmitAfterEP = cd.getFirstClaimIndexToSubmitAfterEP();
        uint coverId;
        uint dateUpd;
        bool submit;
        address qadd;
        for (uint i = firstClaimIndexToSubmitAfterEP; i < lengthOfClaimSubmittedAtEP; i++) {
            (coverId, dateUpd, submit) = cd.getClaimOfEmergencyPauseByIndex(i);
            require(submit == false);
            qadd = qd.getCoverMemberAddress(coverId);
            _addClaim(coverId, dateUpd, qadd);
            cd.setClaimSubmittedAtEPTrue(i, true);
        }
        cd.setFirstClaimIndexToSubmitAfterEP(lengthOfClaimSubmittedAtEP);
    }

    /**
     * @dev Castes vote for members who have tokens locked under Claims Assessment
     * @param claimId  claim id.
     * @param verdict 1 for Accept,-1 for Deny.
     */ 
    function submitCAVote(uint claimId, int8 verdict) public isMemberAndcheckPause {
        require(checkVoteClosing(claimId) != 1); 
        require(cd.userClaimVotePausedOn(msg.sender).add(cd.pauseDaysCA()) < now);  
        uint tokens = tc.tokensLockedAtTime(msg.sender, "CLA", now.add(cd.claimDepositTime()));
        require(tokens > 0);
        uint stat;
        (, stat) = cd.getClaimStatusNumber(claimId);
        require(stat == 0);
        require(cd.getUserClaimVoteCA(msg.sender, claimId) == 0);
        td.bookCATokens(msg.sender);
        cd.addVote(msg.sender, tokens, claimId, verdict);
        cd.callVoteEvent(msg.sender, claimId, "CAV", tokens, now, verdict);
        uint voteLength = cd.getAllVoteLength();
        cd.addClaimVoteCA(claimId, voteLength);
        cd.setUserClaimVoteCA(msg.sender, claimId, voteLength);
        cd.setClaimTokensCA(claimId, verdict, tokens);
        tc.extendLockOf(msg.sender, "CLA", td.lockCADays());
        int close = checkVoteClosing(claimId);
        if (close == 1) {
            cr.changeClaimStatus(claimId);
        }
    }

    /**
     * @dev Submits a member vote for assessing a claim.
     * Tokens other than those locked under Claims
     * Assessment can be used to cast a vote for a given claim id.
     * @param claimId Selected claim id.
     * @param verdict 1 for Accept,-1 for Deny.
     */ 
    function submitMemberVote(uint claimId, int8 verdict) public isMemberAndcheckPause {
        require(checkVoteClosing(claimId) != 1);
        uint stat;
        uint tokens = tc.totalBalanceOf(msg.sender);
        (, stat) = cd.getClaimStatusNumber(claimId);
        require(stat >= 1 && stat <= 5);
        require(cd.getUserClaimVoteMember(msg.sender, claimId) == 0);
        cd.addVote(msg.sender, tokens, claimId, verdict);
        cd.callVoteEvent(msg.sender, claimId, "MV", tokens, now, verdict);
        tc.lockForMemberVote(msg.sender, td.lockMVDays());
        uint voteLength = cd.getAllVoteLength();
        cd.addClaimVotemember(claimId, voteLength);
        cd.setUserClaimVoteMember(msg.sender, claimId, voteLength);
        cd.setClaimTokensMV(claimId, verdict, tokens);
        int close = checkVoteClosing(claimId);
        if (close == 1) {
            cr.changeClaimStatus(claimId);
        }
    }

    /**
    * @dev Pause Voting of All Pending Claims when Emergency Pause Start.
    */ 
    function pauseAllPendingClaimsVoting() public onlyInternal {
        uint firstIndex = cd.pendingClaimStart();
        uint actualClaimLength = cd.actualClaimLength();
        for (uint i = firstIndex; i < actualClaimLength; i++) {
            if (checkVoteClosing(i) == 0) {
                uint dateUpd = cd.getClaimDateUpd(i);
                cd.setPendingClaimDetails(i, (dateUpd.add(cd.maxVotingTime())).sub(now), false);
            }
        }
    }

    /**
     * @dev Resume the voting phase of all Claims paused due to an emergency pause.
     */
    function startAllPendingClaimsVoting() public onlyInternal {
        uint firstIndx = cd.getFirstClaimIndexToStartVotingAfterEP();
        uint i;
        uint lengthOfClaimVotingPause = cd.getLengthOfClaimVotingPause();
        for (i = firstIndx; i < lengthOfClaimVotingPause; i++) {
            uint pendingTime;
            uint claimID;
            (claimID, pendingTime, ) = cd.getPendingClaimDetailsByIndex(i);
            uint pTime = (now.sub(cd.maxVotingTime())).add(pendingTime);
            cd.setClaimdateUpd(claimID, pTime);
            cd.setPendingClaimVoteStatus(i, true);
            uint coverid;
            (, coverid) = cd.getClaimCoverId(claimID);
            address qadd = qd.getCoverMemberAddress(coverid);
            tf.extendCNEPOff(qadd, coverid, pendingTime.add(cd.claimDepositTime()));
            p1.closeClaimsOraclise(claimID, uint64(pTime));
        }
        cd.setFirstClaimIndexToStartVotingAfterEP(i);
    }

    /**
     * @dev Checks if voting of a claim should be closed or not.
     * @param claimId Claim Id.
     * @return close 1 -> voting should be closed, 0 -> if voting should not be closed,
     * -1 -> voting has already been closed.
     */ 
    function checkVoteClosing(uint claimId) public view returns(int8 close) {
        close = 0;
        uint status;
        (, status) = cd.getClaimStatusNumber(claimId);
        uint dateUpd = cd.getClaimDateUpd(claimId);
        if (status == 12 && dateUpd.add(cd.payoutRetryTime()) < now) {
            if (cd.getClaimState12Count(claimId) < 60)
                close = 1;
        } 
        
        if (status > 5 && status != 12) {
            close = -1;
        }  else if (dateUpd.add(cd.maxVotingTime()) <= now && status != 12) {
            close = 1;
        } else if (dateUpd.add(cd.minVotingTime()) >= now && status != 12) {
            close = 0;
        } else if (status == 0 || (status >= 1 && status <= 5)) {
            close = _checkVoteClosingFinal(claimId, status);
        }
        
    }

    /**
     * @dev Checks if voting of a claim should be closed or not.
     * Internally called by checkVoteClosing method
     * for Claims whose status number is 0 or status number lie between 2 and 6.
     * @param claimId Claim Id.
     * @param status Current status of claim.
     * @return close 1 if voting should be closed,0 in case voting should not be closed,
     * -1 if voting has already been closed.
     */
    function _checkVoteClosingFinal(uint claimId, uint status) internal view returns(int8 close) {
        close = 0;
        uint coverId;
        (, coverId) = cd.getClaimCoverId(claimId);
        bytes4 curr = qd.getCurrencyOfCover(coverId);
        uint tokenx1e18 = tf.getTokenPrice(curr);
        uint accept;
        uint deny;
        (, accept, deny) = cd.getClaimsTokenCA(claimId);
        uint caTokens = ((accept.add(deny)).mul(tokenx1e18)).div(DECIMAL1E18);
        (, accept, deny) = cd.getClaimsTokenMV(claimId);
        uint mvTokens = ((accept.add(deny)).mul(tokenx1e18)).div(DECIMAL1E18);
        uint sumassured = qd.getCoverSumAssured(coverId).mul(DECIMAL1E18);
        if (status == 0 && caTokens >= sumassured.mul(10)) {
            close = 1;
        } else if (status >= 1 && status <= 5 && mvTokens >= sumassured.mul(10)) {
            close = 1;
        }
    }

    /**
     * @dev Changes the status of an existing claim id, based on current 
     * status and current conditions of the system
     * @param claimId Claim Id.
     * @param stat status number.  
     */
    function _setClaimStatus(uint claimId, uint stat) internal {

        uint origstat;
        uint state12Count;
        uint dateUpd;
        uint coverId;
        (, coverId, , origstat, dateUpd, state12Count) = cd.getClaim(claimId);
        (, origstat) = cd.getClaimStatusNumber(claimId);

        if (stat == 12 && origstat == 12) {
            cd.updateState12Count(claimId, 1);
        }
        cd.setClaimStatus(claimId, stat);

        if (state12Count >= 60 && stat == 12) {
            cd.setClaimStatus(claimId, 13);
            qd.changeCoverStatusNo(coverId, uint8(QuotationData.CoverStatus.ClaimDenied));
        }
        uint time = now;
        cd.setClaimdateUpd(claimId, time);

        if (stat >= 2 && stat <= 5) {
            p1.closeClaimsOraclise(claimId, cd.maxVotingTime());
        }

        if (stat == 12 && (dateUpd.add(cd.payoutRetryTime()) <= now) && (state12Count < 60)) {
            p1.closeClaimsOraclise(claimId, cd.payoutRetryTime());
        } else if (stat == 12 && (dateUpd.add(cd.payoutRetryTime()) > now) && (state12Count < 60)) {
            uint64 timeLeft = uint64((dateUpd.add(cd.payoutRetryTime())).sub(now));
            p1.closeClaimsOraclise(claimId, timeLeft);
        }
    }

    /**
     * @dev Submits a claim for a given cover note.
     * Set deposits flag against cover.
     */
    function _addClaim(uint coverId, uint time, address add) internal {
        tf.depositCN(coverId);
        uint len = cd.actualClaimLength();
        cd.addClaim(len, coverId, add, now);
        cd.callClaimEvent(coverId, add, len, time);
        qd.changeCoverStatusNo(coverId, uint8(QuotationData.CoverStatus.ClaimSubmitted));
        bytes4 curr = qd.getCurrencyOfCover(coverId);
        uint sumAssured = qd.getCoverSumAssured(coverId).mul(DECIMAL1E18);
        pd.changeCurrencyAssetVarMin(curr, pd.getCurrencyAssetVarMin(curr).add(sumAssured));
        p2.internalLiquiditySwap(curr);
        p1.closeClaimsOraclise(len, cd.maxVotingTime());
    }
}
