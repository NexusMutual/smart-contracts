// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

/// @dev this interface is needed because ITokenController interface is imported in contracts that must be compiled with
/// lower solidity version, which does not support custom errors
interface ITokenControllerErrors {
  error CantMintToNonMemberAddress();
  error NoWithdrawableGovernanceRewards();
  error OnlyStakingPoolManager();
  error DeadlinePassed();
  error ManagerIsLockedForVoting();
  error OnlyProposedManager();
  error OwnershipOfferHasExpired();
  error OnlyStakingPool();
  error MemberBalanceNotZero();
  error MemberHasStakingPools();
}
