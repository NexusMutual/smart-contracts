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

  // todo: remove if FE doesn't need it
  mapping(uint assessorMemberId => EnumerableSet.UintSet) private _groupsForAssessor;
  mapping(uint productTypeId => AssessmentData) private _assessmentData;

  mapping(uint claimId => Assessment) private _assessments;

  mapping(uint assessorMemberId => mapping(uint claimId => Ballot)) private _ballots; 
  // todo: do we want just event instead of storing?
  mapping(uint assessorMemberId => mapping(uint claimId => bytes32)) private _ballotsMetadata;

  /* ========== CONSTANTS ========== */

  uint internal constant VOTING_PERIOD = 3 days;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _registry) RegistryAware(_registry) {}

  /* ========== GROUP MANAGEMENT ========== */
  /* ========== VIEWS ========== */

  function getGroupsCount() override external view returns (uint groupCount) {
    groupCount = _groupCount;
  }

  function getGroupAssessorCount(uint groupId) public view returns (uint assessorCount) {
    assessorCount = _groups[groupId].length();
  }

  function getGroupAssessors(uint groupId) public view returns (uint[] memory assessorMemberIds) {
    assessorMemberIds = _groups[groupId].values();
  }

  function isAssessorInGroup(uint assessorMemberId, uint groupId) override external view returns (bool) {
    return _groups[groupId].contains(assessorMemberId);
  }

  function getGroupsForAssessor(uint assessorMemberId) override external view returns (uint[] memory groupIds) {
    groupIds = _groupsForAssessor[assessorMemberId].values();
  }

  function getGroupsData(uint[] calldata groupIds) override external view returns (AssessmentGroupView[] memory groups) {
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

  function setAssessmentDataForProductTypes(
    uint[] calldata productTypeIds,
    uint cooldownPeriod,
    uint groupId
  ) override external onlyContracts(C_GOVERNOR) {
    uint length = productTypeIds.length;
    for (uint i = 0; i < length; i++) {
      _assessmentData[productTypeIds[i]] = AssessmentData({
        assessingGroupId: groupId.toUint16(),
        cooldownPeriod: cooldownPeriod.toUint32()
      });
    }

    emit AssessmentDataForProductTypesSet(productTypeIds, cooldownPeriod, groupId);
  }

  /* ========== MUTATIVE FUNCTIONS ========== */

  function addAssessorsToGroup(uint[] calldata assessorMemberIds, uint groupId) override external onlyContracts(C_GOVERNOR) {
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
      emit AssessorAddedToGroup(groupId, assessorMemberId);
    }
  }

  function setGroupMetadata(uint groupId, bytes32 ipfsMetadata) override external onlyContracts(C_GOVERNOR) {
    require(groupId > 0 && groupId <= _groupCount, InvalidGroupId());

    _groupsMetadata[groupId] = ipfsMetadata;
    emit GroupMetadataSet(groupId, ipfsMetadata);
  }

  function removeAssessorFromGroup(uint assessorMemberId, uint groupId) override external onlyContracts(C_GOVERNOR) {
    require(groupId > 0 && groupId <= _groupCount, InvalidGroupId());

    require(assessorMemberId != 0, InvalidMemberId());
    _groups[groupId].remove(assessorMemberId);
    _groupsForAssessor[assessorMemberId].remove(groupId);
    emit AssessorRemovedFromGroup(groupId, assessorMemberId);
  }

  function removeAssessorFromAllGroups(uint assessorMemberId) override external onlyContracts(C_GOVERNOR) {
    require(assessorMemberId != 0, InvalidMemberId());

    uint[] memory assessorsGroups = _groupsForAssessor[assessorMemberId].values();
    uint assessorsGroupsLength = assessorsGroups.length;
    for (uint groupIndex = 0; groupIndex < assessorsGroupsLength; groupIndex++) {
      uint groupId = assessorsGroups[groupIndex];
      _groups[groupId].remove(assessorMemberId);
      emit AssessorRemovedFromGroup(groupId, assessorMemberId);
    }

    _clearSet(_groupsForAssessor[assessorMemberId]._inner);
  }

  function undoVotes(uint assessorMemberId, uint[] calldata claimIds) override external onlyContracts(C_GOVERNOR) {
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
  function votingPeriod() override external pure returns (uint) {
    return VOTING_PERIOD;
  }

  /// @notice Returns the payout cooldown period for a given product type
  /// @param productTypeId The product type identifier
  /// @return The cooldown period in seconds
  function payoutCooldown(uint productTypeId) override external view returns (uint) {
    AssessmentData memory assessmentData = _assessmentData[productTypeId];
    require(assessmentData.assessingGroupId != 0, InvalidProductType());

    return assessmentData.cooldownPeriod;
  }

  /// @notice Returns the assessor group ID for a given claim
  /// @param claimId The claim identifier
  /// @return The group ID of the assessors for the claim
  function assessorGroupOf(uint claimId) override external view returns (uint32) {
    Assessment memory assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());

    return assessment.assessingGroupId;
  }

  function getAssessment(uint claimId) override external view returns(Assessment memory assessment) {
    return _assessments[claimId];
  }

  function getAssessmentResult(uint claimId) override external view returns(uint cooldownEnd, AssessmentStatus status) {
    Assessment memory assessment = _assessments[claimId];
    cooldownEnd = assessment.votingEnd + assessment.cooldownPeriod;
    return (cooldownEnd, _getAssessmentStatus(assessment));
  }

  function _getAssessmentStatus(Assessment memory assessment) internal view returns(AssessmentStatus status) {
    if (block.timestamp < assessment.votingEnd) {
      return AssessmentStatus.VOTING;
    }

    if (!_hasCooldownPassed(assessment)) {
      return AssessmentStatus.COOLDOWN;
    }

    if (assessment.acceptVotes > assessment.denyVotes) {
      return AssessmentStatus.ACCEPTED;
    } else if (assessment.acceptVotes < assessment.denyVotes) {
      return AssessmentStatus.DENIED;
    } else {
      return AssessmentStatus.DRAW;
    }
  }

  /// @notice Returns the ballot for a given claim and assessor
  /// @param claimId The claim identifier
  /// @param assessor The address of the assessor
  /// @return The Ballot struct for the assessor on the claim
  function ballotOf(uint claimId, address assessor) override external view returns (Ballot memory) {
    (uint assessorMemberId, ) = _validateAssessor(claimId, assessor);
    return _ballots[assessorMemberId][claimId];
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// @notice Initiates a new assessment for a claim
  /// @param claimId Unique identifier for the claim
  /// @param productTypeId Type of product the claim is for
  /// @dev Only callable by internal contracts
  /// @dev Reverts if an assessment already exists for the given claimId
  function startAssessment(uint claimId, uint16 productTypeId) override external onlyContracts(C_CLAIMS) {
    require(_assessments[claimId].start == 0, AssessmentAlreadyExists());

    // validate that assessment data exists for the product type
    AssessmentData memory assessmentData = _assessmentData[productTypeId];
    require(assessmentData.assessingGroupId != 0, InvalidProductType());

    uint32 startTime = block.timestamp.toUint32();
    uint32 votingEndTime = (startTime + VOTING_PERIOD).toUint32();

    _assessments[claimId] = Assessment({
      assessingGroupId: assessmentData.assessingGroupId,
      cooldownPeriod: assessmentData.cooldownPeriod,
      start: startTime,
      votingEnd: votingEndTime,
      acceptVotes: 0,
      denyVotes: 0
    });

    emit AssessmentStarted(claimId, assessmentData.assessingGroupId, startTime, votingEndTime);
  }

  function castVote(uint claimId, bool voteSupport, bytes32 ipfsHash) override external whenNotPaused(PAUSE_ASSESSMENTS) {
    (uint assessorMemberId, Assessment memory assessment) = _validateAssessor(claimId, msg.sender);

    require(block.timestamp > assessment.votingEnd, VotingPeriodEnded());
    require(_ballots[assessorMemberId][claimId].timestamp == 0, AlreadyVoted());

    if (voteSupport) {
      assessment.acceptVotes++;
    } else {
      assessment.denyVotes++;
    }

    _assessments[claimId] = assessment;

    _ballots[assessorMemberId][claimId] = Ballot({
      timestamp: uint32(block.timestamp),
      support: voteSupport
    });
    _ballotsMetadata[assessorMemberId][claimId] = ipfsHash;

    emit VoteCast(claimId, msg.sender, assessorMemberId, voteSupport, ipfsHash);
  }

  function closeVoting(uint claimId) override external {
    Assessment memory assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());
    require(assessment.votingEnd > block.timestamp, VotingAlreadyClosed());

    uint[] memory assessors = getGroupAssessors(assessment.assessingGroupId);
    uint groupSize = assessors.length;
    uint totalVotesFromGroup = 0;

    for(uint i = 0; i < groupSize; i++) {
      if (_ballots[assessors[i]][claimId].timestamp > 0) {
        totalVotesFromGroup++;
      } else {
        // can break early because we need everybody to vote
        break;
      }
    }

    require(totalVotesFromGroup == groupSize, NotEverybodyVoted());

    assessment.votingEnd = block.timestamp.toUint32();
    _assessments[claimId] = assessment;

    emit AssessmentVotingEndChanged(claimId, assessment.votingEnd);
  }

  function resetVotingPeriod(uint claimId) override external onlyContracts(C_GOVERNOR) {
    Assessment memory assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());
    require(!_hasCooldownPassed(assessment), AssessmentCooldownPassed(claimId));

    assessment.votingEnd = (block.timestamp + VOTING_PERIOD).toUint32();
    _assessments[claimId] = assessment;

    emit AssessmentVotingEndChanged(claimId, assessment.votingEnd);
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
    require(assessorMemberId > 0, OnlyMember());
    assessment = _assessments[claimId];

    require(assessment.start != 0, InvalidClaimId());
    require(_groups[assessment.assessingGroupId].contains(assessorMemberId), InvalidAssessor());

    return (assessorMemberId, assessment);
  }

  function _hasCooldownPassed(Assessment memory assessment) internal view returns (bool) {
    uint cooldownEnd = assessment.votingEnd + assessment.cooldownPeriod;
    return (block.timestamp > cooldownEnd);
  }
}
