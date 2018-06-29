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
import "./pool3.sol";
import "./poolData.sol";
import "./claimsReward.sol";
import "./claimsData.sol";
import "./master.sol";
import "./SafeMaths.sol";
import "./Iupgradable.sol";


contract claims is Iupgradable {
    using SafeMaths
    for uint;

    struct claimRewardStatus {
        string claimStatusDesc;
        uint percCA;
        uint percMV;
    }

    claimRewardStatus[] rewardStatus;
    nxmToken2 tc2;
    nxmToken tc1;
    claimsReward cr;
    pool p1;
    claimsData cd;
    nxmTokenData td;
    poolData pd;
    pool3 p3;
    address public masterAddress;
    master ms;
    quotationData qd;

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

    modifier isMemberAndcheckPause {

        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    function changeDependentContractAddress() onlyInternal {
        uint currentVersion = ms.currentVersion();
        td = nxmTokenData(ms.versionContractAddress(currentVersion, "TD"));
        tc2 = nxmToken2(ms.versionContractAddress(currentVersion, "TOK2"));
        p1 = pool(ms.versionContractAddress(currentVersion, "P1"));
        cd = claimsData(ms.versionContractAddress(currentVersion, "CD"));
        tc1 = nxmToken(ms.versionContractAddress(currentVersion, "TOK1"));
        qd = quotationData(ms.versionContractAddress(currentVersion, "QD"));
        pd = poolData(ms.versionContractAddress(currentVersion, "PD"));
        p3 = pool3(ms.versionContractAddress(currentVersion, "P3"));
        cr = claimsReward(ms.versionContractAddress(currentVersion, "CR"));
    }

    /// @dev Sets the minimum, maximum claims assessment voting, escalation and payout retry times 
    /// @param _minVoteTime Minimum time(in milliseconds) for which claim assessment voting is open
    /// @param _maxVoteTime Maximum time(in milliseconds) for which claim assessment voting is open
    /// @param escaltime Time(in milliseconds) in which, after a denial by claims assessor, a person can escalate claim for member voting
    /// @param payouttime Time(in milliseconds) after which a payout is retried(in case a claim is accepted and payout fails)
    function setTimes(uint32 _minVoteTime, uint32 _maxVoteTime, uint32 escaltime, uint32 payouttime) onlyInternal {

        cd.setEscalationTime(escaltime);
        cd.setPayoutRetryTime(payouttime);
        cd.setMaxVotingTime(_maxVoteTime);
        cd.setMinVotingTime(_minVoteTime);
    }

    /// @dev Adds status names for Claims.
    /// @param stat description for claim status
    /// @param percCA reward Percentage for claim assessor
    /// @param percMV reward Percentage for members
    function pushStatus(string stat, uint percCA, uint percMV) onlyInternal {
        rewardStatus.push(claimRewardStatus(stat, percCA, percMV));
    }

    /// @param statusNumber the number of type of status
    /// @return percCA reward Percentage for claim assessor
    /// @return percMV reward Percentage for members
    function getRewardStatus(uint statusNumber) constant returns(uint percCA, uint percMV) {
        return (rewardStatus[statusNumber].percCA, rewardStatus[statusNumber].percMV);
    }

    /// @dev Gets claim details of claim id=pending claim start + given index
    function getClaimFromNewStart(uint index) 
    constant 
    returns(string status, uint coverId, uint claimId, int8 voteCA, int8 voteMV, uint8 statusnumber) {
        (coverId, claimId, voteCA, voteMV, statusnumber) = cd.getClaimFromNewStart(index, msg.sender);
        status = rewardStatus[statusnumber].claimStatusDesc;
    }

    /// @dev Gets details of a claim submitted by the calling user, at a given index
    function getUserClaimByIndex(uint index) constant returns(string status, uint coverId, uint claimId) {
        uint statusno;
        (statusno, coverId, claimId) = cd.getUserClaimByIndex(index, msg.sender);
        status = rewardStatus[statusno].claimStatusDesc;
    }

    /// @dev Sets the final vote result(either accept or decline)of a given claimId.
    /// @param claimId Claim Id.
    /// @param verdict 1 if claim is accepted,-1 if declined.
    function changeFinalVerdict(uint claimId, int8 verdict) onlyInternal {

        cd.changeFinalVerdict(claimId, verdict);
    }

    /// @dev Gets details of a given claim id.
    /// @param _claimId Claim Id.
    /// @return status Current status of claim id
    /// @return finalVerdict Decision made on the claim, 1 in case of acceptance, -1 in case of denial
    /// @return claimOwner Address through which claim is submitted
    /// @return coverId Coverid associated with the claim id
    function getClaimbyIndex(uint _claimId) constant returns(uint claimId, string status, int8 finalVerdict, address claimOwner, uint coverId) {

        uint stat;
        claimId = _claimId;
        (, coverId, finalVerdict, stat, , ) = cd.getClaim(_claimId);
        claimOwner = qd.getCoverMemberAddress(coverId);
        status = rewardStatus[stat].claimStatusDesc;
    }
    
    /// @dev Gets number of tokens used by a given address to assess a given claimId 
    /// @param _of User's address.
    /// @param claimId Claim Id.
    /// @return value Number of tokens.
    function getCATokensLockedAgainstClaim(address _of, uint claimId) constant returns(uint value) {

        (, value) = cd.getTokensClaim(_of, claimId);
        uint totalLockedCA = td.getBalanceCAWithAddress(_of);
        if (totalLockedCA < value)
            value = totalLockedCA;
    }

    /// @dev Calculates total amount that has been used to assess a claim. 
    //      Computaion:Adds acceptCA(tokens used for voting in favor a claim) 
    //      denyCA(tokens used for voting against a claim) *  current token price.
    /// @param claimId Claim Id.
    /// @param member Member type 0 for calculating the amount used by Claim Assessors, else result gives amount used by members.
    /// @return tokens Total Amount used in claims assessment.
    function getCATokens(uint claimId, uint member) constant returns(uint tokens) {

        uint coverId;
        (, coverId) = cd.getClaimCoverId(claimId);
        bytes4 curr = qd.getCurrencyOfCover(coverId);
        uint tokenx1e18 = tc1.getTokenPrice(curr);
        uint acceptCA;
        uint acceptMV;
        uint denyCA;
        uint denyMV;
        (, acceptCA, denyCA) = cd.getClaimsTokenCA(claimId);
        (, acceptMV, denyMV) = cd.getClaimsTokenMV(claimId);
        if (member == 0)
            tokens = SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptCA, denyCA)), tokenx1e18), DECIMAL1E18); // amount (not in tokens)
        else
            tokens = SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptMV, denyMV)), tokenx1e18), DECIMAL1E18);
    }

    /// @dev Checks if voting of a claim should be closed or not.
    /// @param claimId Claim Id.
    /// @return close 1 if voting should be closed, 0 if voting should not be closed,-1 if voting has already been closed.
    function checkVoteClosing(uint claimId) constant returns(int8 close) {
        
        close = 0;

        uint8 status;
        (, status) = cd.getClaimStatusNumber(claimId);
        uint dateUpd = cd.getClaimDateUpd(claimId);
        if (status == 12 && SafeMaths.add(dateUpd, cd.payoutRetryTime()) < now)
            if (cd.getClaimState12Count(claimId) < 60)
                close = 1;
        if (status > 4)
            close = -1;
        else if (SafeMaths.add(dateUpd, cd.maxVotingTime()) <= now) {
            close = 1;
        }else if (SafeMaths.add(dateUpd, cd.minVotingTime()) >= now) {
            close = 0;
        }else if (status == 0 || (status >= 1 && status <= 5)) {
            close = checkVoteClosingFinal(claimId, status);
        }
    }

    /// @dev setting the status of claim using claim id.
    /// @param claimId claim id.
    /// @param stat status to be set.
    function setClaimStatus(uint claimId, uint8 stat) onlyInternal {
        setClaimStatusInternal(claimId, stat);
    }

    /// @dev Updates the pending claim start variable, which is the lowest claim id with a pending decision/payout.
    function changePendingClaimStart() onlyInternal {

        uint8 origstat;
        uint8 state12Count;
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

    /// @dev Submits a claim for a given cover note. Adds claim to queue incase of emergency pause else directly submits the claim.
    /// @param coverId Cover Id.
    function submitClaim(uint coverId) {

        address qadd = qd.getCoverMemberAddress(coverId);
        require(qadd == msg.sender);
        // ms=master(masterAddress);
        if (ms.isPause() == false)
            addClaim(coverId, now, qadd);
        else {
            cd.setClaimAtEmergencyPause(coverId, now, false);
            qd.changeCoverStatusNo(coverId, 5);
        }
    }

    ///@dev Submits the claims queued once the emergency pause is switched off.
    function submitClaimAfterEPOff() onlyInternal {

        uint lengthOfClaimSubmittedAtEP = cd.getLengthOfClaimSubmittedAtEP();
        uint firstClaimIndexToSubmitAfterEP = cd.getFirstClaimIndexToSubmitAfterEP();
        uint coverId;
        uint dateUpd;
        bool submit;
        for (uint i = firstClaimIndexToSubmitAfterEP; i < lengthOfClaimSubmittedAtEP; i++) {
            (coverId, dateUpd, submit) = cd.getClaimOfEmergencyPauseByIndex(i);
            if (submit == false) {
                address qadd = qd.getCoverMemberAddress(coverId);
                addClaim(coverId, dateUpd, qadd);
                cd.setClaimSubmittedAtEPTrue(i, true);
            }
        }
        cd.setFirstClaimIndexToSubmitAfterEP(lengthOfClaimSubmittedAtEP);
    }

    /// @dev Members who have tokens locked under Claims Assessment can assess and Vote As a CLAIM ASSESSOR for a given claim id.
    /// @param claimId  claim id. 
    /// @param verdict 1 for Accept,-1 for Deny.
    /// @param tokens number of CAtokens a voter wants to use for the claim assessment.
    //               These tokens are booked for a specified period for time and hence 
    //               cannot be used to cst another vote for the specified period
    function submitCAVote(uint claimId, int8 verdict, uint tokens) isMemberAndcheckPause {

        require(checkVoteClosing(claimId) != 1);
        uint8 stat;
        (, stat) = cd.getClaimStatusNumber(claimId);
        require(stat == 0);
        require(cd.getUserClaimVoteCA(msg.sender, claimId) == 0);
        tc1.bookCATokens(msg.sender, tokens);
        cd.addVote(msg.sender, tokens, claimId, verdict);
        cd.callVoteEvent(msg.sender, claimId, "CAV", tokens, now, verdict);
        uint voteLength = cd.getAllVoteLength();
        cd.addClaimVoteCA(claimId, voteLength);
        cd.setUserClaimVoteCA(msg.sender, claimId, voteLength);
        cd.setClaimTokensCA(claimId, verdict, tokens);

        uint time = td.lockCADays();

        tc2.extendCAWithAddress(msg.sender, time, tokens, claimId);

        int close = checkVoteClosing(claimId);
        if (close == 1) {

            cr.changeClaimStatus(claimId);
        }
    }

    /// @dev Submits a member vote for assessing a claim. 
    //      Tokens other than those locked under Claims 
    //      Assessment can be used to cast a vote for a given claim id.
    /// @param claimId Selected claim id. 
    /// @param verdict 1 for Accept,-1 for Deny.
    /// @param tokens Number of tokens used to case a vote
    function submitMemberVote(uint claimId, int8 verdict, uint tokens) isMemberAndcheckPause {

        require(checkVoteClosing(claimId) != 1);
        uint stat;
        (, stat) = cd.getClaimStatusNumber(claimId);
        require(stat >= 1 && stat <= 5);
        require(cd.getUserClaimVoteMember(msg.sender, claimId) == 0);
        cd.addVote(msg.sender, tokens, claimId, verdict);
        cd.callVoteEvent(msg.sender, claimId, "MV", tokens, now, verdict);
        uint voteLength = cd.getAllVoteLength();
        cd.addClaimVotemember(claimId, voteLength);
        cd.setUserClaimVoteMember(msg.sender, claimId, voteLength);
        cd.setClaimTokensMV(claimId, verdict, tokens);
        uint time = td.lockMVDays();
        time = SafeMaths.add(now, time);
        td.lockMV(msg.sender, time, tokens);
        int close = checkVoteClosing(claimId);
        if (close == 1) {

            cr.changeClaimStatus(claimId);
        }
    }

    /// @dev Pause Voting of All Pending Claims when Emergency Pause Start.
    function pauseAllPendingClaimsVoting() onlyInternal {
        uint firstIndex = cd.pendingClaimStart();
        uint actualClaimLength = cd.actualClaimLength();
        for (uint i = firstIndex; i < actualClaimLength; i++) {
            if (checkVoteClosing(i) == 0) {
                uint dateUpd = cd.getClaimDateUpd(i);
                cd.setPendingClaimDetails(i, SafeMaths.sub((SafeMaths.add(dateUpd, cd.maxVotingTime())), now), false);
            }
        }
    }

    /// @dev Checks if voting of a claim should be closed or not.
    //             Internally called by checkVoteClosing method 
    //             for claims whose status number is 0 or status number lie between 2 and 6.
    /// @param claimId Claim Id.
    /// @param status Current status of claim.
    /// @return close 1 if voting should be closed,0 in case voting should not be closed,-1 if voting has already been closed.
    function checkVoteClosingFinal(uint claimId, uint8 status) internal constant returns(int8 close) {
        close = 0;

        uint coverId;
        (, coverId) = cd.getClaimCoverId(claimId);
        bytes4 curr = qd.getCurrencyOfCover(coverId);
        uint tokenx1e18 = tc1.getTokenPrice(curr);
        uint acceptCA;
        uint acceptMV;
        uint denyCA;
        uint denyMV;
        (, acceptCA, denyCA) = cd.getClaimsTokenCA(claimId);
        (, acceptMV, denyMV) = cd.getClaimsTokenMV(claimId);
        uint caTokens = SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptCA, denyCA)), tokenx1e18), DECIMAL1E18);
        uint mvTokens = SafeMaths.div(SafeMaths.mul((SafeMaths.add(acceptMV, denyMV)), tokenx1e18), DECIMAL1E18);
        uint sumassured = SafeMaths.mul(qd.getCoverSumAssured(coverId), DECIMAL1E18);
        if (status == 0 && caTokens >= SafeMaths.mul(10, sumassured))
            close = 1;

        if (status >= 1 && status <= 5 && mvTokens >= SafeMaths.mul(10, sumassured))
            close = 1;
    }

    /// @dev Changes the status of an existing claim id, based on current status and current conditions of the system
    /// @param claimId Claim Id.
    /// @param stat status number.
    function setClaimStatusInternal(uint claimId, uint8 stat) internal {

        uint origstat;
        uint state12Count;
        uint dateUpd;
        (, , , origstat, dateUpd, state12Count) = cd.getClaim(claimId);
        (, origstat) = cd.getClaimStatusNumber(claimId);

        if (stat == 12 && origstat == 12) {
            cd.updateState12Count(claimId, 1);
        }
        cd.setClaimStatus(claimId, stat);

        if (state12Count >= 60 && stat == 12)

            cd.setClaimStatus(claimId, 13);
        uint time = now;
        cd.setClaimdateUpd(claimId, time);

        if (stat >= 2 && stat <= 5) {
            p1.closeClaimsOraclise(claimId, cd.maxVotingTime());
        }

        if (stat == 12 && (SafeMaths.add(dateUpd, cd.payoutRetryTime()) <= now) && (state12Count < 60)) {
            cr.changeClaimStatus(claimId);
        } else if (stat == 12 && (SafeMaths.add(dateUpd, cd.payoutRetryTime()) > now) && (state12Count < 60)) {
            uint64 timeLeft = uint64(SafeMaths.sub(SafeMaths.add(dateUpd, cd.payoutRetryTime()), now));
            p1.closeClaimsOraclise(claimId, timeLeft);
        }
    }

    ///@dev Submits a claim for a given cover note. Deposits 20% of the tokens locked against cover.
    function addClaim(uint coverId, uint time, address add) internal {

        uint nowtime = now;
        uint tokens;
        uint coverLength;
        (, coverLength) = td.getUserCoverDepositCNLength(add, coverId);
        if (coverLength == 0) {
            (, , tokens) = td.getUserCoverLockedCN(add, coverId);
            tokens = SafeMaths.div(SafeMaths.mul(tokens, 20), 100);
        } else
            (, , , tokens) = td.getUserCoverDepositCNByIndex(add, coverId, 0);

        uint timeStamp = SafeMaths.add(nowtime, cd.claimDepositTime());
        tc2.depositCN(coverId, tokens, timeStamp, add);
        uint len = cd.actualClaimLength();
        cd.addClaim(len, coverId, add, nowtime);
        cd.callClaimEvent(coverId, msg.sender, len, time);
        qd.changeCoverStatusNo(coverId, 4);
        bytes4 curr = qd.getCurrencyOfCover(coverId);
        uint sumAssured = qd.getCoverSumAssured(coverId);
        pd.changeCurrencyAssetVarMin(curr, SafeMaths.add64(pd.getCurrencyAssetVarMin(curr), uint64(sumAssured)));
        p3.checkLiquidityCreateOrder(curr);
        p1.closeClaimsOraclise(len, cd.maxVotingTime());
    }
}