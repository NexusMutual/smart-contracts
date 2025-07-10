// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import {EnumerableSet} from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

interface IPermissionedAssessment {

  /* ========== DATA STRUCTURES ========== */

  struct AssessmentData {
    uint32 assessingGroupId;
    uint32 cooldownPeriod;
  }

  struct AssessmentGroupView {
    uint id;
    string ipfsMetadata;
    address[] assessors;
  }

  struct Ballot {
    bytes32 ipfsHash;
    Vote vote;
    uint32 timestamp;
  }

  struct Assessment {
    uint32 start;
    uint32 end;
    uint32 assessorGroupId;
    mapping(uint256 assessorMemberId => Ballot) ballot; // only stores latest choice
  }

  enum Vote {
    NONE, // 0 - default
    ACCEPT, // 1
    DENY // 2
  }

  /* ========== VIEWS ========== */

  // Groups management

  // function getGroupsCount() external view returns (uint groupCount);

  // function getGroupAssessorCount(uint groupId) external view returns (uint assessorCount);

  // function getGroupAssessors(uint groupId) external view returns (address[] memory assessors);

  // function isAssessorInGroup(address assessor, uint groupId) external view returns (bool);

  // function getGroupsForAssessor(address assessor) external view returns (uint[] memory groupIds);

  // function getGroupsData(uint[] calldata groupIds) external view returns (AssessmentGroupView[] memory groups);

  // Voting

  function minVotingPeriod() external pure returns (uint256);

  function silentEndingPeriod() external pure returns (uint256);

  function payoutCooldown(uint256 productTypeId) external view returns (uint256);

  function assessorGroupOf(uint256 claimId) external view returns (uint32);

  function getAssessmentInfo(uint256 claimId) external view returns (uint256 accepts, uint256 denies, uint256 groupSize, uint32 end, uint32 finalizedAt, AssessmentResult result);

  function isAssessmentDecided(uint256 claimId) external view returns (bool);

  function getVoteTally(uint256 claimId) external view returns (uint256 acceptCount, uint256 denyCount);

  function ballotOf(uint256 claimId, address assessor) external view returns (Ballot memory);

  function claimsOpenForVoting(address assessor) external view returns (bytes32[] memory);

  function getOutcome(uint256 claimId) external view returns (bool accepted);

  /* === MUTATIVE FUNCTIONS ==== */

  // Groups management

  // function makeNewGroup(address[] calldata assessors, string calldata ipfsMetadata) external returns (uint groupId);

  // function addAssessorsToGroup(address[] calldata assessors, uint groupId) external;

  // function setGroupMetadata(uint groupId, string calldata ipfsMetadata) external;

  // function removeAssessorsFromGroup(address[] calldata assessors, uint groupId) external;

  // function removeAssessorsFromAllGroups(address[] calldata assessors) external;

  // Voting

  function castVote(uint256 claimId, Vote vote, bytes32 ipfsHash) external;

  function startAssessment(uint256 claimId, uint16 productTypeId) external;

  /* ========= EVENTS ========== */

  event SetAssessmentDataForProductTypesa(uint[] productTypeIds, uint cooldownPeriod, uint groupId);
  event AddAssessorsToGroup(uint indexed groupId, address[] assessors);
  event RemoveAssessorsFromGroup(uint indexed groupId, address[] assessors);
  event RemoveAssessorsFromAllGroups(address[] assessors);

  event AssessmentStarted(
    uint256 indexed claimId,
    uint32 assessorGroupId,
    uint32 start,
    uint32 end
  );

  event VoteCast(
    uint256 indexed claimId,
    address indexed assessor,
    uint256 indexed assessorMemberId,
    Vote vote,
    bytes32 ipfsHash
  );

  event AssessmentClosed(uint256 claimId);
  event AssessmentExtended(uint256 claimId, uint32 newEnd);


  /* ========== ERRORS ========== */

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
