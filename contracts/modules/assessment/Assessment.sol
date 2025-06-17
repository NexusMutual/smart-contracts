// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

import "../../abstract/Multicall.sol";
import "../../interfaces/IAssessment.sol";
import "../../abstract/RegistryAware.sol";
import "../../libraries/SafeUintCast.sol";

contract Assessment is IAssessment, RegistryAware, Multicall {
  using EnumerableSet for EnumerableSet.UintSet;
  using SafeUintCast for uint;

  /* ========== STATE VARIABLES ========== */

  mapping(uint groupId => EnumerableSet.UintSet) private _groups;
  mapping(uint groupId => bytes32) private _groupsMetadata;
  uint32 private _groupCount;

  mapping(uint assessorMemberId => EnumerableSet.UintSet) private _groupsForAssessor;

  // todo: do we keep assessment data (voting group, cooldown) here or in the coverProducts?
  mapping(uint productTypeId => AssessmentData) private _assessmentData;

  mapping(uint claimId => Assessment) private _assessments;

  // todo: move ipfs hashes out?
  // todo: have array instead of mapping so we can think of reverting votes on removal?
  mapping(uint assessorMemberId => mapping(uint claimId => Ballot)) private _ballots; // only stores latest choice

  // mapping(uint assessorMemberId => Ballot[]) _ballots;
  // mapping(uint ballotId => Ballot) _ballots;
  // mapping(uint assessorMemberId => mapping(uint claimId => bool)) _hasVoted;

  /* ========== CONSTANTS ========== */

  uint internal constant VOTING_PERIOD = 3 days;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _registry) RegistryAware(_registry) {}

  /* ========== GROUP MANAGEMENT ========== */
  /* ========== VIEWS ========== */

  function getGroupsCount() external view returns (uint groupCount) {
    groupCount = _groupCount;
  }

  function getGroupAssessorCount(uint groupId) external view returns (uint assessorCount) {
    assessorCount = _groups[groupId].length();
  }

  function getGroupAssessors(uint groupId) external view returns (uint[] memory assessorMemberIds) {
    assessorMemberIds = _groups[groupId].values();
  }

  function isAssessorInGroup(uint assessorMemberId, uint groupId) external view returns (bool) {
    return _groups[groupId].contains(assessorMemberId);
  }

  function getGroupsForAssessor(uint assessorMemberId) external view returns (uint[] memory groupIds) {
    groupIds = _groupsForAssessor[assessorMemberId].values();
  }

  function getGroupsData(uint[] calldata groupIds) external view returns (AssessmentGroupView[] memory groups) {
    uint length = groupIds.length;
    groups = new AssessmentGroupView[](length);

    for (uint i = 0; i < length; i++) {
      uint groupId = groupIds[i];
      groups[i] = AssessmentGroupView({
        id: groupId,
        ipfsMetadata: _groupsMetadata[groupId],
        assessors: _groups[groupId].values()
      });
    }

    return groups;
  }

  // todo: check if we want setProductTypes.setProductTypes to also be able to call this function
  function setAssessmentDataForProductTypes(
    uint[] calldata productTypeIds,
    uint cooldownPeriod,
    uint groupId
  ) external onlyContracts(C_GOVERNOR | C_COVER_PRODUCTS) {
    uint length = productTypeIds.length;
    for (uint i = 0; i < length; i++) {
      _assessmentData[productTypeIds[i]] = AssessmentData({
        assessingGroupId: groupId.toUint32(),
        cooldownPeriod: cooldownPeriod.toUint32()
      });
    }

    emit SetAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, groupId);
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  function addAssessorsToGroup(uint[] calldata assessorMemberIds, uint groupId) external onlyContracts(C_GOVERNOR) {
    // make new group id
    if (groupId == 0) {
      groupId = ++_groupCount;
    }

    uint length = assessorMemberIds.length;
    for (uint i = 0; i < length; i++) {
      uint assessorMemberId = assessorMemberIds[i];
      require(assessorMemberId != 0, InvalidMemberId());
      _groups[groupId].add(assessorMemberId);
      _groupsForAssessor[assessorMemberId].add(groupId);
      emit AddAssessorToGroup(groupId, assessorMemberId);
    }
  }

  function setGroupMetadata(uint groupId, bytes32 ipfsMetadata) external onlyContracts(C_GOVERNOR) {
    require(groupId > 0 && groupId <= _groupCount, InvalidGroupId());

    _groupsMetadata[groupId] = ipfsMetadata;
    emit SetGroupMetadata(groupId, ipfsMetadata);
  }

  function removeAssessorFromGroup(uint assessorMemberId, uint groupId) external onlyContracts(C_GOVERNOR) {
    require(groupId > 0 && groupId <= _groupCount, InvalidGroupId());

    require(assessorMemberId != 0, InvalidMemberId());
    _groups[groupId].remove(assessorMemberId);
    _groupsForAssessor[assessorMemberId].remove(groupId);
    emit RemoveAssessorFromGroup(groupId, assessorMemberId);
  }

  function removeAssessorFromAllGroups(uint assessorMemberId) external onlyContracts(C_GOVERNOR) {
    require(assessorMemberId != 0, InvalidMemberId());

    uint[] memory assessorsGroups = _groupsForAssessor[assessorMemberId].values();
    uint assessorsGroupsLength = assessorsGroups.length;
    for (uint groupIndex = 0; groupIndex < assessorsGroupsLength; groupIndex++) {
      uint groupId = assessorsGroups[groupIndex];
      _groups[groupId].remove(assessorMemberId);
      emit RemoveAssessorFromGroup(groupId, assessorMemberId);
    }

    _clearSet(_groupsForAssessor[assessorMemberId]._inner);
  }

  function undoVotes(uint assessorMemberId, uint[] calldata claimIds) external onlyContracts(C_GOVERNOR) {
    uint len = claimIds.length;
    for (uint i = 0; i < len; i++) {
      uint claimId = claimIds[i];
      Ballot memory ballot = _ballots[assessorMemberId][claimId];
      Assessment memory assessment = _assessments[claimId];

      require(ballot.timestamp > 0, HasNotVoted(claimId));
      require(!_hasCooldownPassed(assessment), AssessmentCooldownPassed(claimId));

      if (ballot.support) {
        assessment.acceptVotes--;
      } else {
        assessment.denyVotes--;
      }

      _assessments[claimId] = assessment;
      delete _ballots[assessorMemberId][claimId];
    }
  }

  function _clearSet(EnumerableSet.Set storage set) internal {
    uint len = set._values.length;
    for (uint i = 0; i < len; i++) {
      delete set._indexes[set._values[i]];
    }
    delete set._values;
  }

  /* ========== VOTING ========== */
  /* ========== VIEWS ========== */

  /// @notice Returns the voting period for assessments
  /// @return The voting period in seconds
  function votingPeriod() external pure returns (uint) {
    return VOTING_PERIOD;
  }

  /// @notice Returns the payout cooldown period for a given product type
  /// @param productTypeId The product type identifier
  /// @return The cooldown period in seconds
  function payoutCooldown(uint productTypeId) external view returns (uint) {
    // TODO: call CoverProduct to validate productTypeId?
    AssessmentData memory assessmentData = _assessmentData[productTypeId];
    require(assessmentData.assessingGroupId != 0, InvalidProductType());

    return assessmentData.cooldownPeriod;
  }

  /// @notice Returns the assessor group ID for a given claim
  /// @param claimId The claim identifier
  /// @return The group ID of the assessors for the claim
  function assessorGroupOf(uint claimId) external view returns (uint32) {
    Assessment storage assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());

    return assessment.assessmentData.assessingGroupId;
  }

  /// @notice Returns assessment voting info for a claim
  /// @param claimId The claim identifier
  /// @return acceptVotes Number of accept votes (snapshot if finalized, live tally otherwise)
  /// @return denyVotes Number of deny votes (snapshot if finalized, live tally otherwise)
  /// @return groupSize Number of assessors in the group
  /// @return start Voting period start timestamp
  /// @return end Voting period end timestamp
  /// @return finalizedAt Timestamp when assessment was finalized (0 if not finalized)
  function getAssessmentInfo(
    uint claimId
  )
    external
    view
    returns (
      uint8 acceptVotes,
      uint8 denyVotes,
      uint groupSize,
      uint32 start,
      uint32 end,
      uint32 finalizedAt,
      bool cooldownPassed
    )
  {
    Assessment memory assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());

    groupSize = _groups[assessment.assessmentData.assessingGroupId].length();
    end = (assessment.start + VOTING_PERIOD).toUint32();
    finalizedAt = assessment.finalizedAt > 0 ? assessment.finalizedAt : end;

    return (
      assessment.acceptVotes,
      assessment.denyVotes,
      groupSize,
      assessment.start,
      end,
      finalizedAt,
      _hasCooldownPassed(assessment)
    );
  }

  /// @notice Returns the ballot for a given claim and assessor
  /// @param claimId The claim identifier
  /// @param assessor The address of the assessor
  /// @return The Ballot struct for the assessor on the claim
  function ballotOf(uint claimId, address assessor) external view returns (Ballot memory) {
    (uint assessorMemberId, ) = _validateAssessor(claimId, assessor);
    return _ballots[assessorMemberId][claimId];
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// @notice Initiates a new assessment for a claim
  /// @param claimId Unique identifier for the claim
  /// @param productTypeId Type of product the claim is for
  /// @dev Only callable by internal contracts
  /// @dev Reverts if an assessment already exists for the given claimId
  function startAssessment(uint claimId, uint16 productTypeId) external onlyContracts(C_CLAIMS) {
    Assessment storage assessment = _assessments[claimId];
    require(assessment.start == 0, AssessmentAlreadyExists());

    // validate that assessment data exists for the product type
    AssessmentData memory assessmentData = _assessmentData[productTypeId];
    uint32 assessingGroupId = assessmentData.assessingGroupId;
    require(assessingGroupId != 0, MissingAssessmentDataForProductType(productTypeId));

    uint32 start = block.timestamp.toUint32();
    uint32 end = (start + VOTING_PERIOD).toUint32();

    assessment.start = start;
    assessment.assessmentData = assessmentData;
    // finalizedAt, acceptVotes, denyVotes are initialized to 0 by default

    emit AssessmentStarted(claimId, assessingGroupId, start, end);
  }

  function castVote(uint claimId, bool voteSupport, bytes32 ipfsHash) external whenNotPaused(PAUSE_ASSESSMENTS) {
    // Validate assessor and get assessment data
    (uint assessorMemberId, Assessment memory assessment) = _validateAssessor(claimId, msg.sender);

    require(!_isVotingClosed(assessment), VotingPeriodEnded());

    Ballot memory previousVote = _ballots[assessorMemberId][claimId];
    // Undo the vote if already voted
    if (previousVote.timestamp > 0) {
      if (previousVote.support) {
        assessment.acceptVotes--;
      } else {
        assessment.denyVotes--;
      }
    }

    if (voteSupport) {
      assessment.acceptVotes++;
    } else {
      assessment.denyVotes++;
    }

    _tryFinalize(assessment);
    _assessments[claimId] = assessment;

    _ballots[assessorMemberId][claimId] = Ballot({
      support: voteSupport,
      ipfsHash: ipfsHash,
      timestamp: uint32(block.timestamp)
    });

    emit VoteCast(claimId, msg.sender, assessorMemberId, voteSupport, ipfsHash);
  }

  function hasCooldownPassed(uint claimId) external view returns (bool) {
    return _hasCooldownPassed(_assessments[claimId]);
  }

  /* ========== INTERNAL FUNCTIONS ========== */

  /// @dev Validates if an address is an assessor for a claim and returns related data
  /// @param claimId The claim identifier
  /// @param assessor The address to validate
  /// @return assessorMemberId The member ID of the assessor
  /// @return assessment The assessment data for the claim
  function _validateAssessor(
    uint claimId,
    address assessor
  ) internal view returns (uint assessorMemberId, Assessment memory assessment) {
    assessorMemberId = registry.getMemberId(assessor);
    require(assessorMemberId > 0, MustBeMember(assessor));
    assessment = _assessments[claimId];

    require(assessment.start != 0, InvalidClaimId());
    require(_groups[assessment.assessmentData.assessingGroupId].contains(assessorMemberId), InvalidAssessor());

    return (assessorMemberId, assessment);
  }

  /**
   * @dev Returns true when no further votes should be accepted.
   *
   * Voting is considered closed when:
   *   1) A majority (accept vs deny) already exists, AND
   *   2) Either every assessor has voted, or the fixed voting period has elapsed.
   *
   * If there is a draw after the period elapsed we still return false so that
   * additional votes can break the deadlock.
   */
  function _isVotingClosed(Assessment memory assessment) internal view returns (bool closed) {
    // Already finalized (i.e. closed)
    if (assessment.finalizedAt != 0) return true;

    // Keep allowing voting if draw
    bool hasMajority = assessment.acceptVotes != assessment.denyVotes;
    if (!hasMajority) return false;

    bool votingPeriodOver = block.timestamp >= assessment.start + VOTING_PERIOD.toUint32();
    return votingPeriodOver;
  }

  function _hasCooldownPassed(Assessment memory assessment) internal view returns (bool) {
    if (!_isVotingClosed(assessment)) return false;

    uint votingEnd = assessment.finalizedAt > 0 ? assessment.finalizedAt : assessment.start + VOTING_PERIOD;
    uint cooldownEnd = votingEnd + assessment.assessmentData.cooldownPeriod;

    return (block.timestamp > cooldownEnd);
  }

  function _tryFinalize(Assessment memory assessment) internal view {
    uint assessorGroupLength = _groups[assessment.assessmentData.assessingGroupId].length();

    // Keep allowing voting if draw
    bool hasMajority = assessment.acceptVotes != assessment.denyVotes;
    if (!hasMajority) return;

    // Finalize if everyone voted
    bool allVoted = assessment.acceptVotes + assessment.denyVotes == assessorGroupLength;
    if (allVoted) {
      assessment.finalizedAt = block.timestamp.toUint32();
    }
  }
}
