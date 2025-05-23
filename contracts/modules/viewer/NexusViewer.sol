// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {Multicall} from "../../abstract/Multicall.sol";
import {IAssessment} from "../../interfaces/IAssessment.sol";
import {IAssessmentViewer} from "../../interfaces/IAssessmentViewer.sol";
import {IGovernance} from "../../interfaces/IGovernance.sol";
import {INexusViewer} from "../../interfaces/INexusViewer.sol";
import {INXMMaster} from "../../interfaces/INXMMaster.sol";
import {IStakingViewer} from "../../interfaces/IStakingViewer.sol";
import {ITokenController} from "../../interfaces/ITokenController.sol";

/// @title NexusViewer Contract
/// @notice This contract provides a unified view of system-wide data from various contracts within the Nexus Mutual protocol.
contract NexusViewer is INexusViewer, Multicall {

  INXMMaster public immutable master;
  IStakingViewer public immutable stakingViewer;
  IAssessmentViewer public immutable assessmentViewer;

  constructor(INXMMaster _master, IStakingViewer _stakingViewer, IAssessmentViewer _assessmentViewer) {
    master = _master;
    stakingViewer = _stakingViewer;
    assessmentViewer = _assessmentViewer;
  }

  /// @notice Retrieves the claimable NXM tokens across the protocol for a given member.
  /// @dev Ensure the tokenIds passed belongs to the member address.
  /// @param member The address of the member to query.
  /// @param tokenIds An array of staking NFT token IDs associated with the member.
  /// @return A ClaimableNxm struct containing details of the claimable NXM tokens.
  function getClaimableNXM(address member, uint[] calldata tokenIds) external view returns (ClaimableNXM memory) {

    // Governance
    uint governanceRewards = _governance().getPendingReward(member);
    
    // Assessment
    IAssessmentViewer.AssessmentRewards memory assessmentRewards = assessmentViewer.getRewards(member);
    (uint assessmentStake, IAssessmentViewer.AssessmentStakeLockedState memory stakeLockedState) = _getAssessmentStake(member);

    // Staking Pool
    IStakingViewer.AggregatedTokens memory aggregatedTokens = stakingViewer.getAggregatedTokens(tokenIds);
    uint managerTotalRewards = stakingViewer.getManagerTotalRewards(member);

    // V1
    uint legacyClaimAssessmentTokens = _tokenController().tokensLocked(member, "CLA");
    
    return ClaimableNXM({
      governanceRewards: governanceRewards,
      assessmentRewards: assessmentRewards.withdrawableAmountInNXM,
      assessmentStake: stakeLockedState.isStakeLocked ? 0 : assessmentStake,
      stakingPoolTotalRewards: aggregatedTokens.totalRewards,
      stakingPoolTotalExpiredStake: aggregatedTokens.totalExpiredStake,
      managerTotalRewards: managerTotalRewards,
      legacyClaimAssessmentTokens: legacyClaimAssessmentTokens
    });
  }

  /// @notice Retrieves the locked NXM tokens across the protocol for a given member.
  /// @dev Ensure the tokenIds passed belongs to the member address.
  /// @param member The address of the member to query.
  /// @param tokenIds An array of staking NFT token IDs associated with the member.
  /// @return A StakedNXM struct containing details of the locked NXM tokens.
  function getStakedNXM(address member, uint[] calldata tokenIds) external view returns (StakedNXM memory) {

    IStakingViewer.AggregatedTokens memory aggregatedTokens = stakingViewer.getAggregatedTokens(tokenIds);

    IAssessmentViewer.AssessmentRewards memory assessmentRewards = assessmentViewer.getRewards(member);
    (uint assessmentStake, IAssessmentViewer.AssessmentStakeLockedState memory  stakeLockedState) = _getAssessmentStake(member);

    return StakedNXM({
      stakingPoolTotalActiveStake: aggregatedTokens.totalActiveStake,
      assessmentStake: stakeLockedState.isStakeLocked ? assessmentStake : 0,
      assessmentStakeLockupExpiry: stakeLockedState.stakeLockupExpiry,
      assessmentRewards: assessmentRewards.totalPendingAmountInNXM - assessmentRewards.withdrawableAmountInNXM
    });
  }

  function _getAssessmentStake(address member) internal view returns (uint assessmentStake, IAssessmentViewer.AssessmentStakeLockedState memory stakeLockedState) {
    (assessmentStake, , ) = _assessment().stakeOf(member);
    stakeLockedState = assessmentViewer.getStakeLocked(member);
  }

  /* ========== DEPENDENCIES ========== */

  function _assessment() internal view returns (IAssessment) {
    return IAssessment(master.getLatestAddress("AS"));
  }

  function _governance() internal view returns (IGovernance) {
    return IGovernance(master.getLatestAddress("GV"));
  }

  function _tokenController() internal view returns (ITokenController) {
    return ITokenController(master.contractAddresses("TC"));
  }
}
