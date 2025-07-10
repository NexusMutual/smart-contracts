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

  /// @notice Returns the total number of assessor groups
  /// @return groupCount The current number of assessor groups
  function getGroupsCount() override external view returns (uint groupCount) {
    groupCount = _groupCount;
  }

  /// @notice Returns the number of assessors in a specific group
  /// @param groupId The ID of the group to query
  /// @return assessorCount The number of assessors in the group
  function getGroupAssessorCount(uint groupId) public view returns (uint assessorCount) {
    assessorCount = _groups[groupId].length();
  }

  /// @notice Returns all assessor member IDs in a specific group
  /// @param groupId The ID of the group to query
  /// @return assessorMemberIds Array of assessor member IDs in the group
  function getGroupAssessors(uint groupId) public view returns (uint[] memory assessorMemberIds) {
    assessorMemberIds = _groups[groupId].values();
  }

  /// @notice Checks if an assessor is a member of a specific group
  /// @param assessorMemberId The member ID of the assessor
  /// @param groupId The ID of the group to check
  /// @return True if the assessor is in the group, false otherwise
  function isAssessorInGroup(uint assessorMemberId, uint groupId) override external view returns (bool) {
    return _groups[groupId].contains(assessorMemberId);
  }

  /// @notice Returns all group IDs that an assessor belongs to
  /// @param assessorMemberId The member ID of the assessor
  /// @return groupIds Array of group IDs the assessor belongs to
  function getGroupsForAssessor(uint assessorMemberId) override external view returns (uint[] memory groupIds) {
    groupIds = _groupsForAssessor[assessorMemberId].values();
  }

  /// @notice Returns detailed information for multiple groups
  /// @param groupIds Array of group IDs to query
  /// @return groups Array of group data including metadata and assessors
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

  /* ========== MUTATIVE FUNCTIONS ========== */

  /// @notice Adds assessors to a group, creating a new group if groupId is 0
  /// @param assessorMemberIds Array of member IDs to add to the group
  /// @param groupId Target group ID (0 creates new group)
  /// @dev Only callable by governor contract
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

  /// @notice Sets IPFS metadata for a group
  /// @param groupId The ID of the group to update
  /// @param ipfsMetadata The IPFS hash containing group metadata
  /// @dev Only callable by governor contract
  function setGroupMetadata(uint groupId, bytes32 ipfsMetadata) override external onlyContracts(C_GOVERNOR) {
    require(groupId > 0 && groupId <= _groupCount, InvalidGroupId());

    _groupsMetadata[groupId] = ipfsMetadata;
    emit GroupMetadataSet(groupId, ipfsMetadata);
  }

  /// @notice Removes an assessor from a specific group
  /// @param assessorMemberId The member ID of the assessor to remove
  /// @param groupId The ID of the group to remove from
  /// @dev Only callable by governor contract
  function removeAssessorFromGroup(uint assessorMemberId, uint groupId) override external onlyContracts(C_GOVERNOR) {
    require(groupId > 0 && groupId <= _groupCount, InvalidGroupId());

    require(assessorMemberId != 0, InvalidMemberId());
    _groups[groupId].remove(assessorMemberId);
    _groupsForAssessor[assessorMemberId].remove(groupId);
    emit AssessorRemovedFromGroup(groupId, assessorMemberId);
  }

  /// @notice Removes an assessor from all groups they belong to
  /// @param assessorMemberId The member ID of the assessor to remove
  /// @dev Only callable by governor contract
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

  /// @notice Sets assessment configuration for multiple product types
  /// @param productTypeIds Array of product type IDs to configure
  /// @param cooldownPeriod Cooldown period in seconds after voting ends
  /// @param groupId The assessor group ID responsible for these product types
  /// @dev Only callable by governor contract
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

  /// @notice Undoes votes cast by an assessor on multiple claims
  /// @param assessorMemberId The member ID of the assessor whose votes to undo
  /// @param claimIds Array of claim IDs to undo votes for
  /// @dev Only callable by governor contract, must be within cooldown period
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
      delete _ballotsMetadata[assessorMemberId][claimId];

      emit VoteUndone(claimId, assessorMemberId);
    }
  }

  /// @notice Clears all elements from an EnumerableSet
  /// @param set The set to clear
  /// @dev Internal helper function for set cleanup
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

  /// @notice Returns the full assessment data for a claim
  /// @param claimId The ID of the claim to query
  /// @return assessment The complete assessment data including votes and timing
  function getAssessment(uint claimId) override external view returns(Assessment memory assessment) {
    return _assessments[claimId];
  }

  /// @notice Returns the minimum voting period (legacy compatibility)
  /// @return The minimum voting period in seconds
  function minVotingPeriod() external pure returns (uint) {
    return VOTING_PERIOD;
  }

  /// @notice Returns the assessment result and cooldown end time for a claim
  /// @param claimId The ID of the claim to query
  /// @return cooldownEnd Timestamp when the cooldown period ends
  /// @return status Current status of the assessment (VOTING, COOLDOWN, ACCEPTED, DENIED, DRAW)
  function getAssessmentResult(uint claimId) override external view returns(uint cooldownEnd, AssessmentStatus status) {
    Assessment memory assessment = _assessments[claimId];
    cooldownEnd = assessment.votingEnd + assessment.cooldownPeriod;
    return (cooldownEnd, _getAssessmentStatus(assessment));
  }

  /// @notice Determines the current status of an assessment based on timing and votes
  /// @param assessment The assessment data to evaluate
  /// @return status The current assessment status
  /// @dev Internal helper function for status calculation
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
  /// @param assessorMemberId The member ID of the assessor
  /// @return The Ballot struct for the assessor on the claim
  function ballotOf(uint claimId, uint assessorMemberId) override external view returns (Ballot memory) {
    return _ballots[assessorMemberId][claimId];
  }

  /// @notice Returns the ballot metadata for a given claim and assessor
  /// @param claimId The claim identifier
  /// @param assessorMemberId The member ID of the assessor
  /// @return The IPFS hash containing off-chain metadata for the vote
  function getBallotsMetadata(uint claimId, uint assessorMemberId) override external view returns (bytes32) {
    return _ballotsMetadata[assessorMemberId][claimId];
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

  /// @notice Allows an assessor to cast a vote on a claim.
  /// @dev Requires the caller to be a valid assessor for the claim's assigned group.
  ///      Reverts if the voting period has ended or if the assessor has already voted.
  /// @param claimId The unique identifier for the claim to vote on.
  /// @param voteSupport The assessor's vote; `true` to accept the claim, `false` to deny it.
  /// @param ipfsHash An IPFS hash containing off-chain metadata or reasoning for the vote.
  function castVote(uint claimId, bool voteSupport, bytes32 ipfsHash) override external whenNotPaused(PAUSE_ASSESSMENTS) {
    (uint assessorMemberId, Assessment memory assessment) = _validateAssessor(claimId, msg.sender);

    require(block.timestamp < assessment.votingEnd, VotingPeriodEnded());
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

  /// @notice Allows for the early closing of a claim's voting period.
  /// @dev Can only be called if all assigned assessors have cast their votes.
  ///      Sets the assessment's `votingEnd` to the current block timestamp.
  /// @param claimId The unique identifier for the claim.
  function closeVotingEarly(uint claimId) override external {
    Assessment memory assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());
    require(block.timestamp < assessment.votingEnd, VotingAlreadyClosed());

    uint[] memory assessors = getGroupAssessors(assessment.assessingGroupId);
    uint groupSize = assessors.length;
    uint totalVotesFromGroup = 0;

    for (uint i = 0; i < groupSize; i++) {
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

  /// @notice Resets the voting period for a claim, starting a new full voting window.
  /// @dev Can only be called by the Governor contract. Reverts if the assessment's cooldown period has already passed.
  /// @param claimId The unique identifier for the claim.
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
