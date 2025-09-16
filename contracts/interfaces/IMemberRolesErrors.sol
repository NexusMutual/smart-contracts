// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

/// @dev this interface is needed because IMemberRoles interface is imported in contracts that must be compiled with
/// lower solidity version, which does not support custom errors
interface IMemberRolesErrors {
  error NotAuthorized();
  error UserAddressCantBeZero();
  error AddressIsAlreadyMember();
  error TransactionValueDifferentFromJoiningFee();
  error SignatureAlreadyUsed();
  error InvalidSignature();
  error TransferToPoolFailed();
  error LockedForVoting();
  error CantBeStakingPoolManager();
  error HasNXMStakedInClaimAssessmentV1();
  error MemberHasPendingRewardsInTokenController();
  error MemberHasAssessmentStake();
  error NewAddressIsAlreadyMember();
  error MemberAlreadyHasRole();
  error MemberDoesntHaveRole();
}
