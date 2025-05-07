// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMembership {

  mapping(address member => bool active) public members;

  function join(address _address, uint nonce, bytes calldata signature) external payable;

  function swap(address to) external;

  function leave() external;

  function setKycAuthAddress(address) external;

  function members() external view returns (address[] memory);

  event Joined(address indexed member);
  event Left(address indexed member);
  event Swapped(address indexed previous, address indexed current);

  error NotAuthorized();
  error UserAddressCantBeZero();
  error Paused();
  error AddressIsAlreadyMember();
  error TransactionValueDifferentFromJoiningFee();
  error SignatureAlreadyUsed();
  error InvalidSignature();
  error TransferToPoolFailed();
  error OnlyMember();
  error LockedForVoting();
  error CantBeStakingPoolManager();
  error HasNXMStakedInClaimAssessmentV1();
  error MemberHasPendingRewardsInTokenController();
  error MemberHasAssessmentStake();
  error NewAddressIsAlreadyMember();
  error MemberAlreadyHasRole();
  error MemberDoesntHaveRole();
}
