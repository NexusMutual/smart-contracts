// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IAssessment {
  struct AssessmentData {
    uint16 assessingGroupId;
    uint32 cooldownPeriod;
  }

  struct AssessmentGroupView {
    uint id;
    bytes32 ipfsMetadata;
    uint[] assessors;
  }

  struct Ballot {
    uint32 timestamp;
    bool support;
  }

  struct Assessment {
    uint16 assessingGroupId;
    uint32 cooldownPeriod;
    uint32 start;
    uint32 votingEnd;
    uint8 acceptVotes;
    uint8 denyVotes;
  }

  enum AssessmentStatus {
    VOTING,
    COOLDOWN,
    ACCEPTED,
    DENIED,
    DRAW
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function addAssessorsToGroup(uint[] calldata memberId, uint groupId) external;

  function setGroupMetadata(uint groupId, bytes32 ipfsMetadata) external;

  function removeAssessorFromGroup(uint assessorMemberId, uint groupId) external;

  function removeAssessorFromAllGroups(uint assessorMemberId) external;

  function setAssessmentDataForProductTypes(
    uint[] calldata productTypeIds,
    uint cooldownPeriod,
    uint groupId
  ) external;

  function undoVotes(uint assessorMemberId, uint[] calldata claimIds) external;

  function castVote(uint claimId, bool voteSupport, bytes32 ipfsHash) external;

  function startAssessment(uint claimId, uint16 productTypeId) external;

  function resetVotingPeriod(uint claimId) external;

  function closeVotingEarly(uint claimId) external;

  /* ========== VIEWS ========== */

  function getGroupsCount() external view returns (uint groupCount);

  function getGroupAssessorCount(uint groupId) external view returns (uint assessorCount);

  function getGroupAssessors(uint groupId) external view returns (uint[] memory assessorMemberIds);

  function isAssessorInGroup(uint assessorMemberId, uint groupId) external view returns (bool);

  function getGroupsForAssessor(uint assessorMemberId) external view returns (uint[] memory groupIds);

  function getGroupsData(uint[] calldata groupIds) external view returns (AssessmentGroupView[] memory groups);

  function votingPeriod() external pure returns (uint);

  function payoutCooldown(uint productTypeId) external view returns (uint);

  function assessorGroupOf(uint claimId) external view returns (uint32);

  function getAssessmentResult(uint claimId) external view returns(uint cooldownEnd, AssessmentStatus status);

  function ballotOf(uint claimId, address assessor) external view returns (Ballot memory);

  function getAssessment(uint claimId) external view returns(Assessment memory assessment);

  /* ========= EVENTS ========== */

  event AssessmentDataForProductTypesSet(uint[] productTypeIds, uint cooldownPeriod, uint groupId);
  event AssessorAddedToGroup(uint indexed groupId, uint assessorMemberId);
  event AssessorRemovedFromGroup(uint indexed groupId, uint assessorMemberId);
  event GroupMetadataSet(uint indexed groupId, bytes32 ipfsMetadata);

  event AssessmentStarted(
    uint indexed claimId,
    uint assessorGroupId,
    uint start,
    uint end
  );

  event VoteCast(
    uint indexed claimId,
    address indexed assessor,
    uint indexed assessorMemberId,
    bool support,
    bytes32 ipfsHash
  );

  event VoteUndone(
    uint indexed claimId,
    uint indexed assessorMemberId
  );

  event AssessmentVotingEndChanged(uint claimId, uint newEnd);

  /* ========== ERRORS ========== */

  error AssessmentAlreadyExists();
  error InvalidAssessor();
  error InvalidClaimId();
  error InvalidGroupId();
  error InvalidMemberId();
  error InvalidProductType();
  error OnlyMember();
  error VotingPeriodEnded();
  error AssessmentCooldownPassed(uint claimId);
  error HasNotVoted(uint claimId);
  error AlreadyVoted();
  error VotingAlreadyClosed();
  error NotEverybodyVoted();
}
