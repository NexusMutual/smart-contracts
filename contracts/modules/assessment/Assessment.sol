// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import {EnumerableSet} from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

import {Multicall} from "../../abstract/Multicall.sol";
import {IAssessment} from "../../interfaces/IAssessment.sol";
import {RegistryAware, C_GOVERNOR, C_COVER_PRODUCTS, C_CLAIMS, C_ASSESSMENT} from "../../abstract/RegistryAware.sol";
import {SafeUintCast} from "../../libraries/SafeUintCast.sol";

// TODO: is multicall needed?
contract Assessment is IAssessment, RegistryAware, Multicall {
  using EnumerableSet for EnumerableSet.AddressSet;
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

  /* ========== CONSTANTS ========== */

  uint constant internal MIN_VOTING_PERIOD = 3 days;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _registry) RegistryAware(_registry) {
  }

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

  function addAssessorsToGroup(address[] calldata assessors, uint groupId) external onlyContracts(C_GOVERNOR) {
    // make new group id
    if (groupId == 0) {
      groupId = ++_groupCount;
    }

    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      uint assessorMemberId = registry.getMemberId(assessors[i]);
      require(assessorMemberId != 0, MustBeMember(assessors[i]));
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

  // todo: remove by address or by memberId?
  function removeAssessorsFromGroup(address[] calldata assessors, uint groupId) external onlyContracts(C_GOVERNOR) {
    require(groupId > 0 && groupId <= _groupCount, InvalidGroupId());

    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      uint assessorMemberId = registry.getMemberId(assessors[i]);
      require(assessorMemberId != 0, MustBeMember(assessors[i]));
      _groups[groupId].remove(assessorMemberId);
      _groupsForAssessor[assessorMemberId].remove(groupId);
      emit RemoveAssessorFromGroup(groupId, assessorMemberId);
    }
  }

  function removeAssessorsFromAllGroups(address[] calldata assessors) external onlyContracts(C_GOVERNOR) {
    uint length = assessors.length;
    for (uint i = 0; i < length; i++) {
      uint assessorMemberId = registry.getMemberId(assessors[i]);
      require(assessorMemberId != 0, MustBeMember(assessors[i]));

      uint[] memory assessorsGroups = _groupsForAssessor[assessorMemberId].values();
      uint assessorsGroupsLength = assessorsGroups.length;
      for (uint groupIndex = 0; groupIndex < assessorsGroupsLength; groupIndex++) {
        uint groupId = assessorsGroups[groupIndex];
        _groups[groupId].remove(assessorMemberId);
         emit RemoveAssessorFromGroup(groupId, assessorMemberId);
      }

      _clearSet(_groupsForAssessor[assessorMemberId]._inner);
    }
  }

  function _clearSet(EnumerableSet.Set storage set) internal {
      uint len = set._values.length;
      for (uint i = 0; i < len; ++i) {
          delete set._indexes[set._values[i]];
      }
      delete set._values;

      // todo: check using a bit more optimized:
      // assembly {
      //   sstore(set._values.slot, 0);
      // }
  }

  /* ========== VOTING ========== */
  /* ========== VIEWS ========== */

  /// @notice Returns the minimum voting period for assessments
  /// @return The minimum voting period in seconds
  function minVotingPeriod() external pure returns (uint) {
    return MIN_VOTING_PERIOD;
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

    return assessment.assessorGroupId;
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
  ) external view returns (
    uint acceptVotes,
    uint denyVotes,
    uint groupSize,
    uint32 start,
    uint32 end,
    uint32 finalizedAt
  ) {

    Assessment storage assessment = _assessments[claimId];
    uint32 assessmentStart = assessment.start;
    require(assessmentStart != 0, InvalidClaimId());

    EnumerableSet.UintSet storage assessorGroup = _groups[assessment.assessorGroupId];
    groupSize = assessorGroup.length();
    end = (assessment.start + MIN_VOTING_PERIOD).toUint32();
    finalizedAt = assessment.finalizedAt;

    if (finalizedAt != 0) {
      acceptVotes = assessment.acceptVotes;
      denyVotes = assessment.denyVotes;
    } else {
      (acceptVotes, denyVotes) = _getVoteTally(assessment, assessorGroup, groupSize);
    }

    return (acceptVotes, denyVotes, groupSize, start, end, finalizedAt);
  }

  /// @notice Returns the ballot for a given claim and assessor
  /// @param claimId The claim identifier
  /// @param assessor The address of the assessor
  /// @return The Ballot struct for the assessor on the claim
  function ballotOf(uint claimId, address assessor) external view returns (Ballot memory) {
    (uint assessorMemberId, Assessment storage assessment) = _validateAssessor(claimId, assessor);
    return assessment.ballot[assessorMemberId];
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

    // TODO: call CoverProduct to validate productTypeId?
    uint32 assessingGroupId = _assessmentData[productTypeId].assessingGroupId;
    require(assessingGroupId != 0, InvalidProductType());

    uint32 start = block.timestamp.toUint32();
    uint32 end = (start + MIN_VOTING_PERIOD).toUint32();

    assessment.start = start;
    assessment.assessorGroupId = assessingGroupId;
    // finalizedAt, acceptVotes, denyVotes are initialized to 0 by default
    // ballot are initialized to NONE (0) by default

    emit AssessmentStarted(claimId, assessingGroupId, start, end);
  }

  /// @notice Cast a single vote on a claim
  /// @param claimId Identifier of the claim to vote on
  /// @param voteSupport The vote either to support the claim (true) or vote to deny the claim (false)
  /// @param ipfsHash IPFS hash containing vote rationale
  /// @dev Only valid assessors can vote, and polls must be open for voting
  function castVote(uint claimId, bool voteSupport, bytes32 ipfsHash) external whenNotPaused(C_ASSESSMENT) {

    // Validate assessor and get assessment data
    (uint assessorMemberId, Assessment storage assessment) = _validateAssessor(claimId, msg.sender);

    // If assessment period has passed, see if assessment can be closed
    if (block.timestamp >= assessment.start + MIN_VOTING_PERIOD) {
      _closeAssessment(claimId, assessment);
    }

    // Do not allow new votes to be cast if assessment has been closed
    require(assessment.finalizedAt == 0, ClaimAssessmentAlreadyClosed());

    // Update ballot
    Ballot storage ballot = assessment.ballot[assessorMemberId];

    ballot.support = voteSupport;
    ballot.ipfsHash = ipfsHash;
    ballot.timestamp = uint32(block.timestamp);

    emit VoteCast(claimId, msg.sender, assessorMemberId, voteSupport, ipfsHash);
  }

  /// @notice Closes the assessment for a given claim if conditions are met
  /// @param claimId The claim identifier
  function closeAssessment(uint claimId) external {
    _closeAssessment(claimId, _assessments[claimId]);
  }

  /* ========== INTERNAL FUNCTIONS ========== */

  /// @dev Internal function to count votes that accepts a pre-loaded assessor group and assessment
  /// @param assessment The pre-loaded assessment data
  /// @param assessorGroup The pre-loaded assessor group to iterate through
  /// @param assessorGroupLength The pre-loaded length of the assessor group
  /// @return acceptCount Number of assessors who voted to accept the claim
  /// @return denyCount Number of assessors who voted to deny the claim
  function _getVoteTally(
    Assessment storage assessment,
    EnumerableSet.UintSet storage assessorGroup,
    uint assessorGroupLength
  ) internal view returns (uint acceptCount, uint denyCount) {

    uint[] memory assessorMembers = assessorGroup.values();

    acceptCount = 0;
    denyCount = 0;

    for (uint i = 0; i < assessorGroupLength; i++) {
        uint assessorMemberId = assessorMembers[i];
        Ballot storage ballot = assessment.ballot[assessorMemberId];

        // Only count votes that have been cast
        if (ballot.timestamp > 0) {
          ballot.support ? acceptCount++ : denyCount++;
        }
    }

    return (acceptCount, denyCount);
  }

  /// @dev Validates if an address is an assessor for a claim and returns related data
  /// @param claimId The claim identifier
  /// @param assessor The address to validate
  /// @return assessorMemberId The member ID of the assessor
  /// @return assessment The assessment data for the claim
  function _validateAssessor(uint claimId, address assessor) internal view returns (uint assessorMemberId, Assessment storage assessment) {

    assessorMemberId = registry.getMemberId(assessor);
    require(assessorMemberId > 0, MustBeMember(assessor));
    assessment = _assessments[claimId];

    require(assessment.start != 0, InvalidClaimId());
    require(_groups[assessment.assessorGroupId].contains(assessorMemberId), InvalidAssessor());

    return (assessorMemberId, assessment);
  }

  /// @notice Internal: closes the assessment if finalized conditions are met
  /// @param claimId The claim identifier
  /// @param assessment The assessment storage reference
  function _closeAssessment(uint claimId, Assessment storage assessment) internal {
    if (assessment.finalizedAt != 0) return;

    uint32 assessmentStart = assessment.start;
    require(assessmentStart != 0, InvalidClaimId());

    EnumerableSet.UintSet storage assessorGroup = _groups[assessment.assessorGroupId];
    uint assessorGroupLength = assessorGroup.length();

    (uint acceptVotes, uint denyVotes) = _getVoteTally(assessment, assessorGroup, assessorGroupLength);

    bool hasVotesAndNotADraw = acceptVotes != denyVotes; // has votes (i.e. not 0-0) and not a draw
    bool allVoted = acceptVotes + denyVotes == assessorGroupLength;

    uint32 assessmentEnd = assessmentStart + uint32(MIN_VOTING_PERIOD);
    bool endPassed = block.timestamp >= assessmentEnd;

    if (hasVotesAndNotADraw && (endPassed || allVoted)) {
      assessment.finalizedAt = endPassed ? assessmentEnd : uint32(block.timestamp);
      assessment.acceptVotes = acceptVotes.toUint8();
      assessment.denyVotes = denyVotes.toUint8();
      emit AssessmentClosed(claimId);
    }
  }
}
