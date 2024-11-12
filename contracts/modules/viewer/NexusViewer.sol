// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {Multicall} from "../../abstract/Multicall.sol";
import {IAssessment} from "../../interfaces/IAssessment.sol";
import {IAssessmentViewer} from "../../interfaces/IAssessmentViewer.sol";
import {IGovernance} from "../../interfaces/IGovernance.sol";
import {INexusViewer} from "../../interfaces/INexusViewer.sol";
import {INXMMaster} from "../../interfaces/INXMMaster.sol";
import {INXMToken} from "../../interfaces/INXMToken.sol";
import {IPooledStaking} from "../../interfaces/IPooledStaking.sol";
import {IStakingViewer} from "../../interfaces/IStakingViewer.sol";
import {ITokenController} from "../../interfaces/ITokenController.sol";

/// @title NexusViewer Contract
/// @notice This contract provides a unified view of system-wide data from various contracts within the Nexus Mutual protocol.
contract NexusViewer is INexusViewer, Multicall {

  INXMMaster public immutable master;
  INXMToken public nxm;
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

    IStakingViewer.TokenPoolMap[] memory tokenPools = stakingViewer.getStakingPoolsOf(tokenIds);
    uint poolManagerNXMLockedForMV = 0;
    // for each token, get the pool and manager
    for (uint i = 0; i < tokenPools.length; i++) {
      IStakingViewer.Pool memory pool = stakingViewer.getPool(tokenPools[i].poolId);
      // check if pool manager is locked for MV
      uint lockedForMV = nxm.isLockedForMV(pool.manager);
      // get the latest date locked for MV
      if (lockedForMV > 0 && lockedForMV > poolManagerNXMLockedForMV) {
        poolManagerNXMLockedForMV = lockedForMV;
      }
    }

    // V1
    uint legacyPooledStakeRewards = _legacyPooledStaking().stakerReward(member);
    uint legacyPooledStakeDeposits = _legacyPooledStaking().stakerDeposit(member);
    uint legacyClaimAssessmentTokens = _tokenController().tokensLocked(member, "CLA");
    (, , uint legacyCoverNoteDeposits) = _tokenController().getWithdrawableCoverNotes(member);
    
    return ClaimableNXM({
      governanceRewards: governanceRewards,
      assessmentRewards: assessmentRewards.withdrawableAmountInNXM,
      assessmentStake: stakeLockedState.isStakeLocked ? 0 : assessmentStake,
      stakingPoolTotalRewards: aggregatedTokens.totalRewards,
      stakingPoolTotalExpiredStake: aggregatedTokens.totalExpiredStake,
      stakingPoolManagerIsNXMLockedForMV: poolManagerNXMLockedForMV,
      managerTotalRewards: managerTotalRewards,
      legacyPooledStakeRewards: legacyPooledStakeRewards,
      legacyPooledStakeDeposits: legacyPooledStakeDeposits,
      legacyClaimAssessmentTokens: legacyClaimAssessmentTokens,
      legacyCoverNoteDeposits: legacyCoverNoteDeposits
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
