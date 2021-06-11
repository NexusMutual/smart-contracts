// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IClaims {

  function setClaimStatus(uint claimId, uint stat) external;

  function getCATokens(uint claimId, uint member) external view returns (uint tokens);

  function submitClaim(uint coverId) external;

  function submitClaimForMember(uint coverId, address member) external;

  function submitClaimAfterEPOff() external pure;

  function submitCAVote(uint claimId, int8 verdict) external;

  function submitMemberVote(uint claimId, int8 verdict) external;

  function pauseAllPendingClaimsVoting() external pure;

  function startAllPendingClaimsVoting() external pure;

  function checkVoteClosing(uint claimId) external view returns (int8 close);
}
