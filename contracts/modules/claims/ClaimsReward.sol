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

//Claims Reward Contract contains the functions for calculating number of tokens
// that will get rewarded, unlocked or burned depending upon the status of claim.

pragma solidity ^0.5.0;

import "../../interfaces/IPooledStaking.sol";
import "../capital/Pool1.sol";
import "../capital/Pool2.sol";
import "../capital/PoolData.sol";
import "../cover/QuotationData.sol";
import "../governance/Governance.sol";
import "../token/TokenData.sol";
import "../token/TokenFunctions.sol";
import "./Claims.sol";
import "./ClaimsData.sol";

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
  PoolData internal pd;
  Governance internal gv;
  IPooledStaking internal pooledStaking;
  MemberRoles internal memberRoles;

  uint private constant DECIMAL1E18 = uint(10) ** 18;

  function changeDependentContractAddress() public onlyInternal {
    c1 = Claims(ms.getLatestAddress("CL"));
    cd = ClaimsData(ms.getLatestAddress("CD"));
    tk = NXMToken(ms.tokenAddress());
    tc = TokenController(ms.getLatestAddress("TC"));
    td = TokenData(ms.getLatestAddress("TD"));
    tf = TokenFunctions(ms.getLatestAddress("TF"));
    p1 = Pool1(ms.getLatestAddress("P1"));
    p2 = Pool2(ms.getLatestAddress("P2"));
    pd = PoolData(ms.getLatestAddress("PD"));
    qd = QuotationData(ms.getLatestAddress("QD"));
    gv = Governance(ms.getLatestAddress("GV"));
    pooledStaking = IPooledStaking(ms.getLatestAddress("PS"));
    memberRoles = MemberRoles(ms.getLatestAddress("MR"));
  }

  /// @dev Decides the next course of action for a given claim.
  function changeClaimStatus(uint claimid) public checkPause onlyInternal {

    uint coverid;
    (, coverid) = cd.getClaimCoverId(claimid);

    uint status;
    (, status) = cd.getClaimStatusNumber(claimid);

    // when current status is "Pending-Claim Assessor Vote"
    if (status == 0) {
      _changeClaimStatusCA(claimid, coverid, status);
    } else if (status >= 1 && status <= 5) {
      _changeClaimStatusMV(claimid, coverid, status);
    } else if (status == 12) {// when current status is "Claim Accepted Payout Pending"

      uint sumAssured = qd.getCoverSumAssured(coverid).mul(DECIMAL1E18);
      address payable coverHolder = qd.getCoverMemberAddress(coverid);
      bytes4 coverCurrency = qd.getCurrencyOfCover(coverid);

      address payable payoutAddress = memberRoles.getClaimPayoutAddress(coverHolder);
      bool success = p1.sendClaimPayout(coverid, claimid, sumAssured, payoutAddress, coverCurrency);

      if (success) {
        tf.burnStakedTokens(coverid, coverCurrency, sumAssured);
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
    int8 claimVerdict = cd.getFinalVerdict(claimId);
    if (claimVerdict == 0) {
      lastClaimedCheck = true;
    }

    if (claimVerdict == verdict && (claimed == false || flag == 1)) {

      if (check == 1) {
        (perc, , tokensToBeDist) = cd.getClaimRewardDetail(claimId);
      } else {
        (, perc, tokensToBeDist) = cd.getClaimRewardDetail(claimId);
      }

      if (perc > 0) {
        if (check == 1) {
          if (verdict == 1) {
            (, totalTokens,) = cd.getClaimsTokenCA(claimId);
          } else {
            (,, totalTokens) = cd.getClaimsTokenCA(claimId);
          }
        } else {
          if (verdict == 1) {
            (, totalTokens,) = cd.getClaimsTokenMV(claimId);
          } else {
            (,, totalTokens) = cd.getClaimsTokenMV(claimId);
          }
        }
        tokenCalculated = (perc.mul(tokens).mul(tokensToBeDist)).div(totalTokens.mul(100));


      }
    }
  }

  /// @dev Transfers all tokens held by contract to a new contract in case of upgrade.
  function upgrade(address _newAdd) public onlyInternal {
    uint amount = tk.balanceOf(address(this));
    if (amount > 0) {
      require(tk.transfer(_newAdd, amount));
    }

  }

  /// @dev Total reward in token due for claim by a user.
  /// @return total total number of tokens
  function getRewardToBeDistributedByUser(address _add) public view returns (uint total) {
    uint lengthVote = cd.getVoteAddressCALength(_add);
    uint lastIndexCA;
    uint lastIndexMV;
    uint tokenForVoteId;
    uint voteId;
    (lastIndexCA, lastIndexMV) = cd.getRewardDistributedIndex(_add);

    for (uint i = lastIndexCA; i < lengthVote; i++) {
      voteId = cd.getVoteAddressCA(_add, i);
      (tokenForVoteId,,,) = getRewardToBeGiven(1, voteId, 0);
      total = total.add(tokenForVoteId);
    }

    lengthVote = cd.getVoteAddressMemberLength(_add);

    for (uint j = lastIndexMV; j < lengthVote; j++) {
      voteId = cd.getVoteAddressMember(_add, j);
      (tokenForVoteId,,,) = getRewardToBeGiven(0, voteId, 0);
      total = total.add(tokenForVoteId);
    }
    return (total);
  }

  /// @dev Gets reward amount and claiming status for a given claim id.
  /// @return reward amount of tokens to user.
  /// @return claimed true if already claimed false if yet to be claimed.
  function getRewardAndClaimedStatus(uint check, uint claimId) public view returns (uint reward, bool claimed) {
    uint voteId;
    uint claimid;
    uint lengthVote;

    if (check == 1) {
      lengthVote = cd.getVoteAddressCALength(msg.sender);
      for (uint i = 0; i < lengthVote; i++) {
        voteId = cd.getVoteAddressCA(msg.sender, i);
        (, claimid, , claimed) = cd.getVoteDetails(voteId);
        if (claimid == claimId) {break;}
      }
    } else {
      lengthVote = cd.getVoteAddressMemberLength(msg.sender);
      for (uint j = 0; j < lengthVote; j++) {
        voteId = cd.getVoteAddressMember(msg.sender, j);
        (, claimid, , claimed) = cd.getVoteDetails(voteId);
        if (claimid == claimId) {break;}
      }
    }
    (reward,,,) = getRewardToBeGiven(check, voteId, 1);

  }

  /**
   * @dev Function used to claim all pending rewards : Claims Assessment + Risk Assessment + Governance
   * Claim assesment, Risk assesment, Governance rewards
   */
  function claimAllPendingReward(uint records) public isMemberAndcheckPause {
    _claimRewardToBeDistributed(records);
    pooledStaking.withdrawReward(msg.sender);
    uint governanceRewards = gv.claimReward(msg.sender, records);
    if (governanceRewards > 0) {
      require(tk.transfer(msg.sender, governanceRewards));
    }
  }

  /**
   * @dev Function used to get pending rewards of a particular user address.
   * @param _add user address.
   * @return total reward amount of the user
   */
  function getAllPendingRewardOfUser(address _add) public view returns (uint) {
    uint caReward = getRewardToBeDistributedByUser(_add);
    uint pooledStakingReward = pooledStaking.stakerReward(_add);
    uint governanceReward = gv.getPendingReward(_add);
    return caReward.add(pooledStakingReward).add(governanceReward);
  }

  /// @dev Rewards/Punishes users who  participated in Claims assessment.
  //    Unlocking and burning of the tokens will also depend upon the status of claim.
  /// @param claimid Claim Id.
  function _rewardAgainstClaim(uint claimid, uint coverid, uint sumAssured, uint status) internal {
    uint premiumNXM = qd.getCoverPremiumNXM(coverid);
    bytes4 curr = qd.getCurrencyOfCover(coverid);
    uint distributableTokens = premiumNXM.mul(cd.claimRewardPerc()).div(100); // 20% of premium

    uint percCA;
    uint percMV;

    (percCA, percMV) = cd.getRewardStatus(status);
    cd.setClaimRewardDetail(claimid, percCA, percMV, distributableTokens);
    if (percCA > 0 || percMV > 0) {
      tc.mint(address(this), distributableTokens);
    }

    if (status == 6 || status == 9 || status == 11) {
      cd.changeFinalVerdict(claimid, - 1);
      td.setDepositCN(coverid, false); // Unset flag
      tf.burnDepositCN(coverid); // burn Deposited CN

      pd.changeCurrencyAssetVarMin(curr, pd.getCurrencyAssetVarMin(curr).sub(sumAssured));
      p2.internalLiquiditySwap(curr);

    } else if (status == 7 || status == 8 || status == 10) {

      cd.changeFinalVerdict(claimid, 1);
      td.setDepositCN(coverid, false); // Unset flag
      tf.unlockCN(coverid);

      address payable coverHolder = qd.getCoverMemberAddress(coverid);
      address payable payoutAddress = memberRoles.getClaimPayoutAddress(coverHolder);
      bool success = p1.sendClaimPayout(coverid, claimid, sumAssured, payoutAddress, curr);

      if (success) {
        tf.burnStakedTokens(coverid, curr, sumAssured);
        c1.setClaimStatus(claimid, 14);
      }
    }
  }

  /// @dev Computes the result of Claim Assessors Voting for a given claim id.
  function _changeClaimStatusCA(uint claimid, uint coverid, uint status) internal {
    // Check if voting should be closed or not
    if (c1.checkVoteClosing(claimid) == 1) {
      uint caTokens = c1.getCATokens(claimid, 0); // converted in cover currency.
      uint accept;
      uint deny;
      uint acceptAndDeny;
      bool rewardOrPunish;
      uint sumAssured;
      (, accept) = cd.getClaimVote(claimid, 1);
      (, deny) = cd.getClaimVote(claimid, - 1);
      acceptAndDeny = accept.add(deny);
      accept = accept.mul(100);
      deny = deny.mul(100);

      if (caTokens == 0) {
        status = 3;
      } else {
        sumAssured = qd.getCoverSumAssured(coverid).mul(DECIMAL1E18);
        // Min threshold reached tokens used for voting > 5* sum assured
        if (caTokens > sumAssured.mul(5)) {

          if (accept.div(acceptAndDeny) > 70) {
            status = 7;
            qd.changeCoverStatusNo(coverid, uint8(QuotationData.CoverStatus.ClaimAccepted));
            rewardOrPunish = true;
          } else if (deny.div(acceptAndDeny) > 70) {
            status = 6;
            qd.changeCoverStatusNo(coverid, uint8(QuotationData.CoverStatus.ClaimDenied));
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

      if (rewardOrPunish) {
        _rewardAgainstClaim(claimid, coverid, sumAssured, status);
      }
    }
  }

  /// @dev Computes the result of Member Voting for a given claim id.
  function _changeClaimStatusMV(uint claimid, uint coverid, uint status) internal {

    // Check if voting should be closed or not
    if (c1.checkVoteClosing(claimid) == 1) {
      uint8 coverStatus;
      uint statusOrig = status;
      uint mvTokens = c1.getCATokens(claimid, 1); // converted in cover currency.

      // If tokens used for acceptance >50%, claim is accepted
      uint sumAssured = qd.getCoverSumAssured(coverid).mul(DECIMAL1E18);
      uint thresholdUnreached = 0;
      // Minimum threshold for member voting is reached only when
      // value of tokens used for voting > 5* sum assured of claim id
      if (mvTokens < sumAssured.mul(5)) {
        thresholdUnreached = 1;
      }

      uint accept;
      (, accept) = cd.getClaimMVote(claimid, 1);
      uint deny;
      (, deny) = cd.getClaimMVote(claimid, - 1);

      if (accept.add(deny) > 0) {
        if (accept.mul(100).div(accept.add(deny)) >= 50 && statusOrig > 1 &&
        statusOrig <= 5 && thresholdUnreached == 0) {
          status = 8;
          coverStatus = uint8(QuotationData.CoverStatus.ClaimAccepted);
        } else if (deny.mul(100).div(accept.add(deny)) >= 50 && statusOrig > 1 &&
        statusOrig <= 5 && thresholdUnreached == 0) {
          status = 9;
          coverStatus = uint8(QuotationData.CoverStatus.ClaimDenied);
        }
      }

      if (thresholdUnreached == 1 && (statusOrig == 2 || statusOrig == 4)) {
        status = 10;
        coverStatus = uint8(QuotationData.CoverStatus.ClaimAccepted);
      } else if (thresholdUnreached == 1 && (statusOrig == 5 || statusOrig == 3 || statusOrig == 1)) {
        status = 11;
        coverStatus = uint8(QuotationData.CoverStatus.ClaimDenied);
      }

      c1.setClaimStatus(claimid, status);
      qd.changeCoverStatusNo(coverid, uint8(coverStatus));
      // Reward/Punish Claim Assessors and Members who participated in Claims assessment
      _rewardAgainstClaim(claimid, coverid, sumAssured, status);
    }
  }

  /// @dev Allows a user to claim all pending  Claims assessment rewards.
  function _claimRewardToBeDistributed(uint _records) internal {
    uint lengthVote = cd.getVoteAddressCALength(msg.sender);
    uint voteid;
    uint lastIndex;
    (lastIndex,) = cd.getRewardDistributedIndex(msg.sender);
    uint total = 0;
    uint tokenForVoteId = 0;
    bool lastClaimedCheck;
    uint _days = td.lockCADays();
    bool claimed;
    uint counter = 0;
    uint claimId;
    uint perc;
    uint i;
    uint lastClaimed = lengthVote;

    for (i = lastIndex; i < lengthVote && counter < _records; i++) {
      voteid = cd.getVoteAddressCA(msg.sender, i);
      (tokenForVoteId, lastClaimedCheck, , perc) = getRewardToBeGiven(1, voteid, 0);
      if (lastClaimed == lengthVote && lastClaimedCheck == true) {
        lastClaimed = i;
      }
      (, claimId, , claimed) = cd.getVoteDetails(voteid);

      if (perc > 0 && !claimed) {
        counter++;
        cd.setRewardClaimed(voteid, true);
      } else if (perc == 0 && cd.getFinalVerdict(claimId) != 0 && !claimed) {
        (perc,,) = cd.getClaimRewardDetail(claimId);
        if (perc == 0) {
          counter++;
        }
        cd.setRewardClaimed(voteid, true);
      }
      if (tokenForVoteId > 0) {
        total = tokenForVoteId.add(total);
      }
    }
    if (lastClaimed == lengthVote) {
      cd.setRewardDistributedIndexCA(msg.sender, i);
    }
    else {
      cd.setRewardDistributedIndexCA(msg.sender, lastClaimed);
    }
    lengthVote = cd.getVoteAddressMemberLength(msg.sender);
    lastClaimed = lengthVote;
    _days = _days.mul(counter);
    if (tc.tokensLockedAtTime(msg.sender, "CLA", now) > 0) {
      tc.reduceLock(msg.sender, "CLA", _days);
    }
    (, lastIndex) = cd.getRewardDistributedIndex(msg.sender);
    lastClaimed = lengthVote;
    counter = 0;
    for (i = lastIndex; i < lengthVote && counter < _records; i++) {
      voteid = cd.getVoteAddressMember(msg.sender, i);
      (tokenForVoteId, lastClaimedCheck,,) = getRewardToBeGiven(0, voteid, 0);
      if (lastClaimed == lengthVote && lastClaimedCheck == true) {
        lastClaimed = i;
      }
      (, claimId, , claimed) = cd.getVoteDetails(voteid);
      if (claimed == false && cd.getFinalVerdict(claimId) != 0) {
        cd.setRewardClaimed(voteid, true);
        counter++;
      }
      if (tokenForVoteId > 0) {
        total = tokenForVoteId.add(total);
      }
    }
    if (total > 0) {
      require(tk.transfer(msg.sender, total));
    }
    if (lastClaimed == lengthVote) {
      cd.setRewardDistributedIndexMV(msg.sender, i);
    }
    else {
      cd.setRewardDistributedIndexMV(msg.sender, lastClaimed);
    }
  }

  /**
   * @dev Function used to claim the commission earned by the staker.
   */
  function _claimStakeCommission(uint _records, address _user) external onlyInternal {
    uint total = 0;
    uint len = td.getStakerStakedContractLength(_user);
    uint lastCompletedStakeCommission = td.lastCompletedStakeCommission(_user);
    uint commissionEarned;
    uint commissionRedeemed;
    uint maxCommission;
    uint lastCommisionRedeemed = len;
    uint counter;
    uint i;

    for (i = lastCompletedStakeCommission; i < len && counter < _records; i++) {
      commissionRedeemed = td.getStakerRedeemedStakeCommission(_user, i);
      commissionEarned = td.getStakerEarnedStakeCommission(_user, i);
      maxCommission = td.getStakerInitialStakedAmountOnContract(
        _user, i).mul(td.stakerMaxCommissionPer()).div(100);
      if (lastCommisionRedeemed == len && maxCommission != commissionEarned)
        lastCommisionRedeemed = i;
      td.pushRedeemedStakeCommissions(_user, i, commissionEarned.sub(commissionRedeemed));
      total = total.add(commissionEarned.sub(commissionRedeemed));
      counter++;
    }
    if (lastCommisionRedeemed == len) {
      td.setLastCompletedStakeCommissionIndex(_user, i);
    } else {
      td.setLastCompletedStakeCommissionIndex(_user, lastCommisionRedeemed);
    }

    if (total > 0)
      require(tk.transfer(_user, total)); // solhint-disable-line
  }

  function fixStuckStatuses() external {
    cd.setClaimStatus(2, 14);
    cd.setClaimStatus(3, 14);
    cd.setClaimStatus(5, 14);
  }

}
