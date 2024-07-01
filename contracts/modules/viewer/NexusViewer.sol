// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {Multicall} from "../../abstract/Multicall.sol";
import {MasterAwareV2} from "../../abstract/MasterAwareV2.sol";
import {ITokenController} from "../../interfaces/ITokenController.sol";
import {IStakingViewer} from "../../interfaces/IStakingViewer.sol";
import {IPooledStaking} from "../../interfaces/IPooledStaking.sol";
import {IGovernance} from "../../interfaces/IGovernance.sol";
import {IAssessment} from "../../interfaces/IAssessment.sol";

contract NexusViewer is Multicall, MasterAwareV2 {

  struct ClaimableNxm {
    AggregatedTokens aggregatedTokens;
    uint govPendingRewards;
    Staker legacyPoolStake;
    AssessmentRewards assesmentRewards;
  }
  
  struct StakedNxm {
    AggregatedTokens aggregatedTokens;
    Stake assessmentStake;
  }

  struct PoolsAndRewards {
    Pool[] pools;
    Token[] rewards;
  }
  
  struct AssessmentRewards {
    uint totalPendingAmountInNXM;
    uint withdrawableAmountInNXM;
    uint withdrawableUntilIndex;
  }

  struct WithdrawableCoverNotes {
    uint[] coverIds;
    bytes32[] lockReasons;
    uint withdrawableAmount;
  }

  IStakingViewer public immutable stakingViewer; // TODO: how to update stakingViewer

  constructor(INXMMaster _master, IStakingViewer _stakingViewer) {
    master = _master;
    stakingViewer = _stakingViewer;
  }

  /// @notice This does not include NXM from manager rewards (use getManagedPoolsAndRewards)
  function getClaimableNxm(address user, uint[] tokenIds) public view returns (ClaimableNxm) {

    AggregatedTokens aggregatedTokens = stakingViewer.getAggregatedTokens(tokenIds);
    uint govPendingRewards = governance().getPendingReward(user);
    Staker userStake = legacyPooledStaking().stakers(user);

    (
      uint totalPendingAmountInNXM,
      uint withdrawableAmountInNXM,
      uint withdrawableUntilIndex
    ) = assesment().getRewards(user);

    AssessmentRewards assessmentRewards = new AssessmentRewards({
      totalPendingAmountInNXM: totalPendingAmountInNXM,
      withdrawableAmountInNXM: withdrawableAmountInNXM,
      withdrawableUntilIndex: withdrawableUntilIndex
    });

    (
      uint[] memory coverIds,
      bytes32[] memory lockReasons,
      uint withdrawableAmount
    ) = tokenController().getWithdrawableCoverNotes(user);

    WithdrawableCoverNotes withdrawableCoverNotes = new WithdrawableCoverNotes({
      coverIds: coverIds,
      lockReasons: lockReasons,
      withdrawableAmount: withdrawableAmount
    });

    return new ClaimableNxm({
      aggregatedTokens: aggregatedTokens,
      govPendingRewards: govPendingRewards,
      legacyPoolStake: userStake,
      assessmentRewards: assessmentRewards,
      withdrawableCoverNotes: withdrawableCoverNotes
    });
  }

  function getStakedNxm(address manager, uint[] tokenIds) public view returns (StakedNxm) {

    AggregatedTokens aggregatedTokens = stakingViewer.getAggregatedTokens(tokenIds);
    Stake userStake = assesment().stakeOf(address);
    return new StakedNxm({aggregatedTokens: aggregatedTokens, assessmentStake: userStake});
  }

  /// @notice Returns the list of pools managed and NXM rewards by the given manager
  function getManagedPoolsAndRewards(address manager) public view returns (PoolsAndRewards) {

    Pool[] pools = stakingViewer.getManagedStakingPools(manager);
    Token[] rewards = stakingViewer.getManagerTokenRewards(manager);
    return new PoolsAndRewards({ pools: pools, reward: rewards });
  }

  /* ========== DEPENDENCIES ========== */

  function legacyPooledStaking() internal view returns (IPooledStaking) {
    return IPooledStaking(internalContracts[uint(ID.PS)]);
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(internalContracts[uint(ID.AS)]);
  }

  function governance() internal view returns (IGovernance) {
    return IGovernance(internalContracts[uint(ID.GV)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function changeDependentContractAddress() public override {
    internalContracts[uint(ID.PS)] = master.getLatestAddress("PS");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
    internalContracts[uint(ID.GV)] = master.getLatestAddress("GV");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
  }
}
