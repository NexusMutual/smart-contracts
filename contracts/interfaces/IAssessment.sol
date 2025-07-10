// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IAssessment {
  struct AssessmentData {
    uint32 assessingGroupId;
    uint32 cooldownPeriod;
  }

  struct AssessmentGroupView {
    uint id;
    bytes32 ipfsMetadata; // TODO: naming?
    uint[] assessors;
  }

  struct Ballot {
    bytes32 ipfsHash;
    bool support;
    uint32 timestamp;
  }

  struct Assessment {
    uint32 assessorGroupId; // TODO: set AssessmentData instead
    uint32 start;
    uint32 finalizedAt; // 0, not closed yet else timestamp of closure
    uint8 acceptVotes; // 0, if not finalized yet, should only be set onced finalized
    uint8 denyVotes; // 0, if not finalized yet, should only be set onced finalized
    mapping(uint assessor => Ballot) ballot; // only stores latest choice
  }

  enum AssessmentResult {
    NONE,
    ACCEPTED,
    DENIED
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function addAssessorsToGroup(address[] calldata assessors, uint groupId) external;

  function setGroupMetadata(uint groupId, bytes32 ipfsMetadata) external;

  function removeAssessorsFromGroup(address[] calldata assessors, uint groupId) external;

  function removeAssessorsFromAllGroups(address[] calldata assessors) external;

  function castVote(uint claimId, bool voteSupport, bytes32 ipfsHash) external;

  function startAssessment(uint claimId, uint16 productTypeId) external;

  /* ========== VIEWS ========== */

  function getGroupsCount() external view returns (uint groupCount);

  function getGroupAssessorCount(uint groupId) external view returns (uint assessorCount);

  function getGroupAssessors(uint groupId) external view returns (uint[] memory assessorMemberIds);

  function isAssessorInGroup(uint assessorMemberId, uint groupId) external view returns (bool);

  function getGroupsForAssessor(uint assessorMemberId) external view returns (uint[] memory groupIds);

  function getGroupsData(uint[] calldata groupIds) external view returns (AssessmentGroupView[] memory groups);

  function minVotingPeriod() external pure returns (uint);

  function payoutCooldown(uint productTypeId) external view returns (uint);

  function assessorGroupOf(uint claimId) external view returns (uint32);

  function getAssessmentInfo(uint claimId) external view returns (uint acceptVotes, uint denyVotes, uint groupSize, uint32 start, uint32 end, uint32 finalizedAt);

  function ballotOf(uint claimId, address assessor) external view returns (Ballot memory);

  /* ========= EVENTS ========== */

  event SetAssessmentDataForProductTypes(uint[] productTypeIds, uint cooldownPeriod, uint groupId);
  event AddAssessorToGroup(uint indexed groupId, uint assessorMemberId);
  event RemoveAssessorFromGroup(uint indexed groupId, uint assessorMemberId);
  event SetGroupMetadata(uint indexed groupId, bytes32 ipfsMetadata);

  event AssessmentStarted(
    uint indexed claimId,
    uint32 assessorGroupId,
    uint32 start,
    uint32 end
  );

  event VoteCast(
    uint indexed claimId,
    address indexed assessor,
    uint indexed assessorMemberId,
    bool support,
    bytes32 ipfsHash
  );

  event AssessmentClosed(uint claimId);
  event AssessmentExtended(uint claimId, uint32 newEnd);

  /* ========== ERRORS ========== */

  error MustBeMember(address);
  error InvalidGroupId();
  error AssessmentAlreadyExists();
  error ClaimIdsEmpty();
  error ClaimAssessmentAlreadyClosed();
  error ClaimIdsVotesLengthMismatch();
  error ClaimIdsCidsLengthMismatch();
  error ClaimAssessmentNotFinished();
  error EmptyAssessorGroup();
  error InvalidAssessor();
  error InvalidClaimId();
  error InvalidVote();
  error InvalidProductType();
}
