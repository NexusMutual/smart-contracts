// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {Multicall} from "../../abstract/Multicall.sol";
import {IAssessment} from "../../interfaces/IAssessment.sol";
import {IAssessmentViewer} from "../../interfaces/IAssessmentViewer.sol";
import {IGovernance} from "../../interfaces/IGovernance.sol";
import {INXMMaster} from "../../interfaces/INXMMaster.sol";
import {IPooledStaking} from "../../interfaces/IPooledStaking.sol";
import {IStakingViewer} from "../../interfaces/IStakingViewer.sol";
import {ITokenController} from "../../interfaces/ITokenController.sol";

contract NexusViewer is Multicall {
  struct LegacyPoolStake {
    uint deposit;
    uint reward;
  }

  struct ClaimableNxm {
    uint governanceRewards;
    IStakingViewer.AggregatedTokens aggregateStakingTokens;
    IAssessmentViewer.AssessmentRewards assessmentRewards;
    LegacyPoolStake legacyPooledStake;
    uint v1CoverNotesAmount;
  }

  struct LockedNxm {
    IStakingViewer.AggregatedTokens aggregatedTokens;
    uint assessmentStakeAmount;
  }

  INXMMaster public immutable master;
  IStakingViewer public immutable stakingViewer;
  IAssessmentViewer public immutable assessmentViewer;

  constructor(INXMMaster _master, IStakingViewer _stakingViewer, IAssessmentViewer _assessmentViewer) {
    master = _master;
    stakingViewer = _stakingViewer;
    assessmentViewer = _assessmentViewer;
  }

  /// @notice This does not include NXM from manager rewards (use stakingViewer.getManagedPoolsAndRewards)
  function getClaimableNxm(address user, uint[] calldata tokenIds) public view returns (ClaimableNxm memory) {

    IPooledStaking legacyPooledStaking = _legacyPooledStaking();
    uint deposit = legacyPooledStaking.stakerDeposit(user);
    uint reward = legacyPooledStaking.stakerReward(user);
    LegacyPoolStake memory legacyPooledStake = LegacyPoolStake({deposit: deposit, reward: reward});

    IStakingViewer.AggregatedTokens memory aggregatedTokens = stakingViewer.getAggregatedTokens(tokenIds);
    IAssessmentViewer.AssessmentRewards memory assessmentRewards = assessmentViewer.getRewards(user);

    uint governanceRewards = _governance().getPendingReward(user);
    (, , uint withdrawableAmount) = _tokenController().getWithdrawableCoverNotes(user);

    return ClaimableNxm({
      aggregateStakingTokens: aggregatedTokens,
      assessmentRewards: assessmentRewards,
      legacyPooledStake: legacyPooledStake,
      governanceRewards: governanceRewards,
      v1CoverNotesAmount: withdrawableAmount
    });
  }

  function getLockedNxm(address member, uint[] calldata tokenIds) public view returns (LockedNxm memory) {

    IStakingViewer.AggregatedTokens memory aggregatedTokens = stakingViewer.getAggregatedTokens(tokenIds);

    uint assessmentStakeAmount = 0;
    if (assessmentViewer.isStakeLocked(member)) {
      (uint96 amount, , ) = _assessment().stakeOf(member);
      assessmentStakeAmount = uint(amount);
    }

    return LockedNxm({aggregatedTokens: aggregatedTokens, assessmentStakeAmount: assessmentStakeAmount});
  }

  /* ========== DEPENDENCIES ========== */

  function _assessment() internal view returns (IAssessment) {
    return IAssessment(master.getLatestAddress("AS"));
  }

  function _legacyPooledStaking() internal view returns (IPooledStaking) {
    return IPooledStaking(master.getLatestAddress("PS"));
  }

  function _governance() internal view returns (IGovernance) {
    return IGovernance(master.getLatestAddress("GV"));
  }

  function _tokenController() internal view returns (ITokenController) {
    return ITokenController(master.contractAddresses("TC"));
  }
}
