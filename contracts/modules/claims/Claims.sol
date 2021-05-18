/* Copyright (C) 2020 NexusMutual.io

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

pragma solidity ^0.5.0;

import "../capital/Pool.sol";
import "../claims/ClaimsReward.sol";
import "../token/NXMToken.sol";
import "../token/TokenController.sol";
import "../token/TokenFunctions.sol";
import "./ClaimsData.sol";
import "./Incidents.sol";

contract Claims is Iupgradable {
  using SafeMath for uint;

  TokenController internal tc;
  ClaimsReward internal cr;
  Pool internal p1;
  ClaimsData internal cd;
  TokenData internal td;
  QuotationData internal qd;
  Incidents internal incidents;

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
   * @dev Calculates total amount that has been used to assess a claim.
   * Computaion:Adds acceptCA(tokens used for voting in favor of a claim)
   * denyCA(tokens used for voting against a claim) *  current token price.
   * @param claimId Claim Id.
   * @param member Member type 0 -> Claim Assessors, else members.
   * @return tokens Total Amount used in Claims assessment.
   */
  function getCATokens(uint claimId, uint member) external view returns (uint tokens) {
    uint coverId;
    (, coverId) = cd.getClaimCoverId(claimId);

    bytes4 currency = qd.getCurrencyOfCover(coverId);
    address asset = cr.getCurrencyAssetAddress(currency);
    uint tokenx1e18 = p1.getTokenPrice(asset);

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
    td = TokenData(ms.getLatestAddress("TD"));
    tc = TokenController(ms.getLatestAddress("TC"));
    p1 = Pool(ms.getLatestAddress("P1"));
    cr = ClaimsReward(ms.getLatestAddress("CR"));
    cd = ClaimsData(ms.getLatestAddress("CD"));
    qd = QuotationData(ms.getLatestAddress("QD"));
    incidents = Incidents(ms.getLatestAddress("IC"));
  }

  /**
   * @dev Submits a claim for a given cover note.
   * Adds claim to queue incase of emergency pause else directly submits the claim.
   * @param coverId Cover Id.
   */
  function submitClaim(uint coverId) external {
    _submitClaim(coverId, msg.sender);
  }

  function submitClaimForMember(uint coverId, address member) external onlyInternal {
    _submitClaim(coverId, member);
  }

  function _submitClaim(uint coverId, address member) internal {

    require(!ms.isPause(), "Claims: System is paused");

    (/* id */, address contractAddress) = qd.getscAddressOfCover(coverId);
    address token = incidents.coveredToken(contractAddress);
    require(token == address(0), "Claims: Product type does not allow claims");

    address coverOwner = qd.getCoverMemberAddress(coverId);
    require(coverOwner == member, "Claims: Not cover owner");

    uint expirationDate = qd.getValidityOfCover(coverId);
    uint gracePeriod = tc.claimSubmissionGracePeriod();
    require(expirationDate.add(gracePeriod) > now, "Claims: Grace period has expired");

    tc.markCoverClaimOpen(coverId);
    qd.changeCoverStatusNo(coverId, uint8(QuotationData.CoverStatus.ClaimSubmitted));

    uint claimId = cd.actualClaimLength();
    cd.addClaim(claimId, coverId, coverOwner, now);
    cd.callClaimEvent(coverId, coverOwner, claimId, now);
  }

  // solhint-disable-next-line no-empty-blocks
  function submitClaimAfterEPOff() external pure {}

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

  // solhint-disable-next-line no-empty-blocks
  function pauseAllPendingClaimsVoting() external pure {}

  // solhint-disable-next-line no-empty-blocks
  function startAllPendingClaimsVoting() external pure {}

  /**
   * @dev Checks if voting of a claim should be closed or not.
   * @param claimId Claim Id.
   * @return close 1 -> voting should be closed, 0 -> if voting should not be closed,
   * -1 -> voting has already been closed.
   */
  function checkVoteClosing(uint claimId) public view returns (int8 close) {
    close = 0;
    uint status;
    (, status) = cd.getClaimStatusNumber(claimId);
    uint dateUpd = cd.getClaimDateUpd(claimId);
    if (status == 12 && dateUpd.add(cd.payoutRetryTime()) < now) {
      if (cd.getClaimState12Count(claimId) < 60)
        close = 1;
    }

    if (status > 5 && status != 12) {
      close = - 1;
    } else if (status != 12 && dateUpd.add(cd.maxVotingTime()) <= now) {
      close = 1;
    } else if (status != 12 && dateUpd.add(cd.minVotingTime()) >= now) {
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
  function _checkVoteClosingFinal(uint claimId, uint status) internal view returns (int8 close) {
    close = 0;
    uint coverId;
    (, coverId) = cd.getClaimCoverId(claimId);

    bytes4 currency = qd.getCurrencyOfCover(coverId);
    address asset = cr.getCurrencyAssetAddress(currency);
    uint tokenx1e18 = p1.getTokenPrice(asset);

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

    cd.setClaimdateUpd(claimId, now);
  }

}
