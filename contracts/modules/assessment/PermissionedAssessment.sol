// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import {EnumerableSet} from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

import {Multicall} from "../../abstract/Multicall.sol";
import {IPermissionedAssessment} from "../../interfaces/IPermissionedAssessment.sol";
import {IMemberRoles} from "../../interfaces/IMemberRoles.sol";
import {MasterAwareV2} from "../../abstract/MasterAwareV2.sol";
import {SafeUintCast} from "../../libraries/SafeUintCast.sol";

contract PermissionedAssessment is IPermissionedAssessment, MasterAwareV2, Multicall {
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.UintSet;
  using SafeUintCast for uint;

  /* ========== STATE VARIABLES ========== */

  mapping(uint32 groupId => EnumerableSet.UintSet) private _groups;
  mapping(uint32 groupId => bytes32) internal _groupsMetadata;
  uint32 private _groupCount;

  mapping(uint256 assessorMemberId => EnumerableSet.UintSet) private _groupsForAssessor;
  mapping(uint256 productTypeId => AssessmentData) private _assessmentData;

  mapping(uint256 claimId => Assessment) internal _assessments;

  /* ========== CONSTANTS ========== */

  uint constant internal MIN_VOTING_PERIOD = 3 days;

  /* ========== MODIFIERS ========== */

  /* ========== CONSTRUCTOR ========== */

  constructor() {}

  /* ========== VIEWS ========== */

  /// @notice Returns the minimum voting period for assessments
  /// @return The minimum voting period in seconds
  function minVotingPeriod() external pure returns (uint256) {
    return MIN_VOTING_PERIOD;
  }

  /// @notice Returns the payout cooldown period for a given product type
  /// @param productTypeId The product type identifier
  /// @return The cooldown period in seconds
  function payoutCooldown(uint256 productTypeId) external view returns (uint256) {

    // TODO: call CoverProduct to validate productTypeId?
    AssessmentData memory assessmentData = _assessmentData[productTypeId];
    require(assessmentData.assessingGroupId != 0, InvalidProductType());

    return assessmentData.cooldownPeriod;
  }

  /// @notice Returns the assessor group ID for a given claim
  /// @param claimId The claim identifier
  /// @return The group ID of the assessors for the claim
  function assessorGroupOf(uint256 claimId) external view returns (uint32) {

    Assessment storage assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());

    return assessment.assessorGroupId;
  }

  /// @notice Returns assessment voting info for a claim
  /// @param claimId The claim identifier
  /// @return acceptVotes Number of accept votes (snapshot if finalized, live tally otherwise)
  /// @return denyVotes Number of deny votes (snapshot if finalized, live tally otherwise)
  /// @return groupSize Number of assessors in the group
  /// @return end Voting period end timestamp
  /// @return finalizedAt Timestamp when assessment was finalized (0 if not finalized)
  function getAssessmentInfo(
    uint256 claimId
  ) external view returns (
    uint256 acceptVotes,
    uint256 denyVotes,
    uint256 groupSize,
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

    return (acceptVotes, denyVotes, groupSize, end, finalizedAt);
  }

  /// @notice Helper to determine if an assessment can be closed after casting a vote
  /// @dev Checks if the assessment is ready to be closed based on the current vote and voting state
  /// @param claimId The claim identifier
  /// @param vote The vote choice (ACCEPT or DENY) to be cast
  /// @return ready True if the assessment can be closed after this vote, false otherwise
  function isReadyToCloseAfterVote(uint256 claimId, Vote vote) external view returns (bool) {

    require(vote == Vote.ACCEPT || vote == Vote.DENY, InvalidVote());

    (uint256 assessorMemberId, Assessment storage assessment) = _validateAssessor(claimId, msg.sender);

    // Already finalized
    if (assessment.finalizedAt != 0) return false;

    EnumerableSet.UintSet storage group = _groups[assessment.assessorGroupId];
    uint256 groupSize = group.length();

    // Get current vote tally
    (uint acceptVotes, uint denyVotes) = _getVoteTally(assessment, group, groupSize);

    // If has previous vote, remove old vote from tally
    Vote oldVote = assessment.ballot[assessorMemberId].vote;
    if (oldVote == Vote.ACCEPT) acceptVotes--;
    else if (oldVote == Vote.DENY) denyVotes--;

    // Increment the tally with the new vote
    if (vote == Vote.ACCEPT) acceptVotes++;
    else if (vote == Vote.DENY) denyVotes++;

    if (block.timestamp < assessment.start + MIN_VOTING_PERIOD) {
      // can close early if all voted & not draw
      return acceptVotes + denyVotes == groupSize && acceptVotes != denyVotes;
    } else {
      // can close if voting period ended, has votes i.e. not (0-0) and not a draw
      return acceptVotes != denyVotes;
    }
  }


  /// @notice Returns the ballot for a given claim and assessor
  /// @param claimId The claim identifier
  /// @param assessor The address of the assessor
  /// @return The Ballot struct for the assessor on the claim
  function ballotOf(uint256 claimId, address assessor) external view returns (Ballot memory) {
    (uint256 assessorMemberId, Assessment storage assessment) = _validateAssessor(claimId, assessor);
    return assessment.ballot[assessorMemberId];
  }

  function claimsOpenForVoting(address assessor) external view returns (bytes32[] memory) {
    // TODO: should we add another data struct for this? or can be reconstructed via events?
    // is a draw OR no votes (0-0) OR poll has not ended
    // accept === deny || poll.end > block.timestamp
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// @notice Initiates a new assessment for a claim
  /// @param claimId Unique identifier for the claim
  /// @param productTypeId Type of product the claim is for
  /// @dev Only callable by internal contracts
  /// @dev Reverts if an assessment already exists for the given claimId
  function startAssessment(uint256 claimId, uint16 productTypeId) external onlyInternal {

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
  /// @param vote The vote choice (ACCEPT or DENY)
  /// @param ipfsHash IPFS hash containing vote rationale
  /// @dev Only valid assessors can vote, and polls must be open for voting
  function castVote(uint256 claimId, Vote vote, bytes32 ipfsHash) external whenNotPaused {

    require(vote == Vote.ACCEPT || vote == Vote.DENY, InvalidVote());

    // Validate assessor and get assessment data
    (uint256 assessorMemberId, Assessment storage assessment) = _validateAssessor(claimId, msg.sender);

    // If assessment period has passed, see if assessment can be closed
    if (block.timestamp >= assessment.start + MIN_VOTING_PERIOD) {
      _closeAssessment(claimId, assessment);
    }

    // Do not allow new votes to be cast if assessment has been closed
    require(assessment.finalizedAt == 0, ClaimAssessmentAlreadyClosed());

    // Update ballot
    Ballot storage ballot = assessment.ballot[assessorMemberId];

    ballot.vote = vote;
    ballot.ipfsHash = ipfsHash;
    ballot.timestamp = uint32(block.timestamp);

    emit VoteCast(claimId, msg.sender, assessorMemberId, vote, ipfsHash);
  }

  /// @notice Closes the assessment for a given claim if conditions are met
  /// @param claimId The claim identifier
  function closeAssessment(uint256 claimId) external {
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
    uint256 assessorGroupLength
  ) internal view returns (uint256 acceptCount, uint256 denyCount) {

    uint256[] memory assessorMembers = assessorGroup.values();

    acceptCount = 0;
    denyCount = 0;

    for (uint i = 0; i < assessorGroupLength;) {
        uint256 assessorMemberId = assessorMembers[i];
        Vote vote = assessment.ballot[assessorMemberId].vote;

        if (vote == Vote.ACCEPT) acceptCount++;
        else if (vote == Vote.DENY) denyCount++;

        // Unchecked increment to save gas - cannot overflow as assessor group size is a relatively small number
        unchecked { ++i; }
    }

    return (acceptCount, denyCount);
  }

  /// @dev Validates if an address is an assessor for a claim and returns related data
  /// @param claimId The claim identifier
  /// @param assessor The address to validate
  /// @return assessorMemberId The member ID of the assessor
  /// @return assessment The assessment data for the claim
  function _validateAssessor(uint256 claimId, address assessor) internal view returns (uint256 assessorMemberId, Assessment storage assessment) {

    // TODO: implement memberRoles.getMemberId - can be memberId be 0?
    assessorMemberId = _memberRoles().getMemberId(assessor);
    assessment = _assessments[claimId];

    require(assessment.start != 0, InvalidClaimId());
    require(_groups[assessment.groupId].contains(assessorMemberId), InvalidAssessor());

    return (assessorMemberId, assessment);
  }

  /// @notice Internal: closes the assessment if finalized conditions are met
  /// @param claimId The claim identifier
  /// @param assessment The assessment storage reference
  function _closeAssessment(uint256 claimId, Assessment storage assessment) internal {
    if (assessment.finalizedAt != 0) return;

    uint32 assessmentStart = assessment.start;
    require(assessmentStart != 0, InvalidClaimId());

    EnumerableSet.UintSet storage assessorGroup = _groups[assessment.groupId];
    uint256 assessorGroupLength = assessorGroup.length();

    (uint256 acceptVotes, uint256 denyVotes) = _getVoteTally(assessment, assessorGroup, assessorGroupLength);

    bool hasVotesAndNotADraw = acceptVotes != denyVotes; // has votes (i.e. not 0-0) and not a draw
    bool allVoted = acceptVotes + denyVotes == assessorGroupLength;

    uint32 assessmentEnd = assessmentStart + MIN_VOTING_PERIOD;
    bool endPassed = block.timestamp >= assessmentEnd;

    if (hasVotesAndNotADraw && (endPassed || allVoted)) {
      assessment.finalizedAt = endPassed ? assessmentEnd : uint32(block.timestamp);
      assessment.acceptVotes = acceptVotes;
      assessment.denyVotes = denyVotes;
      emit AssessmentClosed(claimId);
    }
  }

  /* ========== DEPENDENCIES ========== */

  /// @notice Gets the MemberRoles contract instance
  /// @return The MemberRoles contract interface
  /// @dev Used to access member role functionality throughout the contract
  function _memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(getInternalContractAddress(ID.MR));
  }

  /// @notice Updates internal contract addresses when contracts are added or upgraded
  /// @dev Automatically called by the master contract during system updates
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
  }
}

// Test cases
// castVote
// assessor votes, before poll.end we remove the assessor
  // after poll.end assessor should be able to vote again
  // poll.end is extended to 24h from time of last vote
// assessment closes early if ALL assessors have voted
  // poll.end should be updated to now
// if the poll ends in less than 24h, a vote should extended it to 24h from the time of last vote
// if the poll ends in more than 24h, a vote should NOT extend poll.end

// startAssessment
// verify the all fields are set correctly
// should revert if assessment already exists

// getOutcome
// - should revert if called with a non-existent claim
// - should revert if empty assessor group
// - should throw if called before poll.end
// - should still throw after poll.end, only if Assessment has no votes yet
// - should throw if there is a draw
// - should return true if acceptCount > denyCount
// - should return false if denyCount > acceptCount
// - should return false if acceptCount == denyCount


// Validation Tests
// ballotOf and hasVoted
// - should revert when called with an assessor not in the assessor group
// - should work correctly for a valid assessor

// castVote
// - should revert if called with a non-existent claim
// - should revert when called by non-assessor / or empty assessor group
// - should revert when called after poll has closed (and at least one vote exists)
// - should revert with invalid vote choice (something other than ACCEPT or DENY)
// - should work when poll.end has passed but no votes exist yet
// - should work when poll.end has passed and there is a draw
// - should close early if all assessors have voted and its not a draw
// - remove assessor should close early if all assessors have voted and its not a draw
// - should not close early if all assessors have voted and its a draw
// - add assessor should not close early if all assessors have voted and its a draw
// - should extend poll.end if the poll ends in less than 24h from the latest vote
// - should NOT extend poll.end if the poll ends in more than 24h from the latest vote

// Edge Cases
// - an assessor should be able to vote multiple times and change their vote (should override previous vote)
// - vote at the last second before poll.end

// Counting & Results Tests
// - zero votes (poll should stay open indefinitely)
// - non-zero draw votes (poll should stay open indefinitely)

// isAssessmentDecided
// - should revert if called with a non-existent claim
// - should return false if there are no votes
// - should return false if there is a draw
// - should return true if there is at least one vote and its not a draw and the voting period has ended
// - test when an assessor is removed from the group
// - test when an assessor is added to the group

// getVoteTally
// - should revert if called with a non-existent claim
// - should count votes correctly with various combinations
// - should handle empty votes properly
// - should return correct counts when some assessors haven't voted
// - test with removed assessors - vote should not count
// - test with empty assessor group - should return 0, 0

// Special Conditions
// - test behavior when assessor group changes mid-poll
// - test behavior during transitions (pausing/unpausing)

// Security Tests
// - try to vote on non-existent claim
// - try to re-open a decided poll
// - try to manipulate timestamps through mining
// - check if malicious assessor can influence voting periods

// getAssessmentInfo
// - should revert if called with a non-existent claim
// - should return correct start, end, accepts, denies
// - should return correct start, end, accepts, denies when an assessor is removed from the group
// - should return correct start, end, accepts, denies when an assessor is added to the group

// assessorGroupOf
// - should revert if called with a non-existent claim
// - should return the correct assessor group

// ballotOf
// - should revert if called with a non-existent claim
// - should revert if called with an assessor not in the assessor group
// - should return the correct ballot

// hasVoted
// - should revert if called with a non-existent claim
// - should revert if called with an assessor not in the assessor group
  // - add assessor to group should not revert and return false
// - should return true if the assessor has voted
// - should return false if the assessor has not voted
// - remove from assessor group after a vote has been cast, should revert