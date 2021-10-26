// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../abstract/LegacyMasterAware.sol";
import "../../interfaces/ILegacyClaims.sol";
import "../../interfaces/ILegacyClaimsData.sol";
import "../../interfaces/ILegacyClaimsReward.sol";
import "../../interfaces/ILegacyIncidents.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ITokenData.sol";

contract LegacyClaims is ILegacyClaims, LegacyMasterAware {
  using SafeMath for uint;

  ITokenController internal tc;
  ILegacyClaimsReward internal cr;
  IPool internal p1;
  ILegacyClaimsData internal cd;
  ITokenData internal td;
  IQuotationData internal qd;
  ILegacyIncidents internal incidents;

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
    revert("Migrate to v2");
  }

  /**
   * Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public onlyInternal {
    td = ITokenData(ms.getLatestAddress("TD"));
    tc = ITokenController(ms.getLatestAddress("TC"));
    p1 = IPool(ms.getLatestAddress("P1"));
    cr = ILegacyClaimsReward(ms.getLatestAddress("CR"));
    cd = ILegacyClaimsData(ms.getLatestAddress("CD"));
    qd = IQuotationData(ms.getLatestAddress("QD"));
    incidents = ILegacyIncidents(ms.getLatestAddress("IC"));
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
    revert("Migrate to v2");
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
      qd.changeCoverStatusNo(coverId, uint8(IQuotationData.CoverStatus.ClaimDenied));
    }

    cd.setClaimdateUpd(claimId, now);
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
  ) {
    (, coverId, finalVerdict, status,,) = cd.getClaim(_claimId);
    claimId = _claimId;
    claimOwner = qd.getCoverMemberAddress(coverId);
  }

}
