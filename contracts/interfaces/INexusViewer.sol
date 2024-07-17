// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {IAssessmentViewer} from "./IAssessmentViewer.sol";
import {IStakingViewer} from "./IStakingViewer.sol";

interface INexusViewer {

  struct ClaimableNXM {
    uint governanceRewards; // Governance rewards in NXM
    uint assessmentRewards; // Claimable assessment reward in NXM
    uint assessmentStake; // Claimable assessment stake in NXM
    uint stakingPoolTotalRewards; // Total staking pool rewards in NXM
    uint stakingPoolTotalExpiredStake; // Total staking pool expired stake in NXM
    uint managerTotalRewards; // Pool manager total staking rewards in NXM
    uint legacyPooledStakeRewards; // Legacy pooled staking rewards in NXM
    uint legacyPooledStakeDeposits; // Legacy pooled staking deposits in NXM
    uint legacyClaimAssessmentTokens; // Legacy claim assessment tokens in NXM
    uint legacyCoverNoteDeposits; // Legacy cover note deposits in NXM
  }

  struct StakedNXM {
    uint stakingPoolTotalActiveStake; // Total amount of active stake in staking pools in NXM
    uint assessmentStake; // Locked assessment stake in NXM
    uint assessmentRewards; // Locked assessment rewards in NXM
  }

  function getClaimableNXM(address member, uint[] calldata tokenIds) external view returns (ClaimableNXM memory);

  function getStakedNXM(address member, uint[] calldata tokenIds) external view returns (StakedNXM memory);
}
