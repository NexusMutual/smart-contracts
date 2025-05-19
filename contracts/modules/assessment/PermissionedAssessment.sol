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

  mapping(uint32 assessorGroupId => EnumerableSet.UintSet assessorGroup) private _assessorGroups;
  mapping(uint32 assessorGroupId => bytes32 assessorGroupMetadata) internal _assessorGroupsMetadata;
  uint32 private _assessorGroupCount;

  mapping(uint256 assessor => EnumerableSet.UintSet) private _assessorGroupsForAssessor;
  mapping(uint256 productTypeId => AssessmentData) private _assessmentData;

  mapping(bytes32 claimId => Assessment assessment) internal _assessments;

  /* ========== CONSTANTS ========== */

  uint constant internal MIN_VOTING_PERIOD = 3 days;
  uint constant internal SILENT_ENDING_PERIOD = 1 days;

  /* ========== MODIFIERS ========== */

  /* ========== CONSTRUCTOR ========== */

  constructor() {}

  /* ========== VIEWS ========== */

  function minVotingPeriod() external pure returns (uint256) {
    return MIN_VOTING_PERIOD;
  }

  function silentEndingPeriod() external pure returns (uint256) {
    return SILENT_ENDING_PERIOD;
  }

  function payoutCooldown(uint256 productTypeId) external view returns (uint256) {
    // TODO: call CoverProduct to validate productTypeId?\
    AssessmentData storage assessmentData = _assessmentData[productTypeId];
    require(assessmentData.assessingGroupId != 0, InvalidProductType());
    return assessmentData.cooldownPeriod;
  }

  function assessorGroupOf(bytes32 claimId) external view returns (uint32) {
    Assessment storage assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());
    return assessment.assessorGroupId;
  }

  function getAssessmentInfo(bytes32 claimId) external view returns (uint32 start, uint32 end, uint256 accepts, uint256 denies) {

    Assessment storage assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());

    EnumerableSet.UintSet storage assessorGroup = _assessorGroups[assessment.assessorGroupId];
    require(assessorGroup.length() > 0, EmptyAssessorGroup());

    (accepts, denies) = _getVoteTally(assessment, assessorGroup);

    return (assessment.start, assessment.end, accepts, denies);
  }

  function ballotOf(bytes32 claimId, address assessor) external view returns (Ballot memory) {
    (uint256 assessorMemberId, Assessment storage assessment) = _validateAssessor(claimId, assessor);
    return assessment.ballot[assessorMemberId];
  }

  function hasVoted(bytes32 claimId, address assessor) external view returns (bool) {
    (uint256 assessorMemberId, Assessment storage assessment) = _validateAssessor(claimId, assessor);
    return assessment.ballot[assessorMemberId].vote != Vote.NONE;
  }

  function claimsOpenForVoting(address assessor) external view returns (bytes32[] memory) {
    // TODO: should we add another data struct for this? or can be reconstructed via events?
    // PollStarted + poll.end > block.timestamp && hasCurrentBallot(claimId) && not a draw
  }

  /// @notice Gets the final outcome of an assessment after voting has completed
  /// @param claimId Identifier of the claim to check
  /// @return accepted True if the claim was accepted, false if denied
  /// @dev Can only be called after a poll has concluded
  function getOutcome(bytes32 claimId) external view returns (bool accepted) {

    Assessment storage assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());

    // Check if the assessment has been decided (has votes, not a draw and voting period has ended)
    EnumerableSet.UintSet storage assessorGroup = _assessorGroups[assessment.assessorGroupId];
    require(assessorGroup.length() > 0, EmptyAssessorGroup());

    (uint256 acceptCount, uint256 denyCount) = _getVoteTally(assessment, assessorGroup);
    require(_isAssessmentDecided(acceptCount, denyCount, assessment), ClaimAssessmentNotFinished());

    return acceptCount > denyCount;
  }

  /// @notice Determines if a poll has completed and a decision can be made
  /// @param claimId The claimId to check
  /// @return true if the assessment has ended, false if still open
  /// @dev A poll is considered decided when:
  /// @dev 1) voting period has ended, 2) at least one vote exists, and 3) it is not a draw
  function isAssessmentDecided(bytes32 claimId) external view returns (bool) {

    Assessment storage assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());

    EnumerableSet.UintSet storage assessorGroup = _assessorGroups[assessment.assessorGroupId];
    require(assessorGroup.length() > 0, EmptyAssessorGroup());

    (uint256 acceptCount, uint256 denyCount) = _getVoteTally(assessment, assessorGroup);

    return _isAssessmentDecided(acceptCount, denyCount, assessment);
  }

  /// @notice Counts the current votes for and against a claim
  /// @param claimId The unique identifier of the claim to tally
  /// @return acceptCount Number of assessors who voted to accept the claim
  /// @return denyCount Number of assessors who voted to deny the claim
  /// @dev This function considers only votes from current assessors in the group
  function getVoteTally(bytes32 claimId) external view returns (uint256 acceptCount, uint256 denyCount) {
    Assessment storage assessment = _assessments[claimId];
    require(assessment.start != 0, InvalidClaimId());

    EnumerableSet.UintSet storage assessorGroup = _assessorGroups[assessment.assessorGroupId];
    require(assessorGroup.length() > 0, EmptyAssessorGroup());

    return _getVoteTally(assessment, assessorGroup);
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// @notice Initiates a new assessment for a claim
  /// @param claimId Unique identifier for the claim
  /// @param productTypeId Type of product the claim is for
  /// @dev Only callable by internal contracts
  /// @dev Reverts if an assessment already exists for the given claimId
  function startAssessment(bytes32 claimId, uint16 productTypeId) external onlyInternal {
    // TODO: call CoverProduct to validate productTypeId?

    Assessment storage assessment = _assessments[claimId];
    require(assessment.start == 0, AssessmentAlreadyExists());

    AssessmentData storage assessmentData = _assessmentData[productTypeId];
    require(assessmentData.assessingGroupId != 0, InvalidProductType());

    assessment.start = uint32(block.timestamp);
    assessment.end = uint32(block.timestamp + MIN_VOTING_PERIOD);
    assessment.assessorGroupId = _assessmentData[productTypeId].assessingGroupId;
    // all votes in assessment.ballot are initialized to NONE (0) by default

    emit AssessmentStarted(claimId, assessment.assessorGroupId, assessment.start, assessment.end);
  }

  /// @notice Cast a single vote on a claim
  /// @param claimId Identifier of the claim to vote on
  /// @param vote The vote choice (ACCEPT or DENY)
  /// @param ipfsHash IPFS hash containing vote rationale
  /// @dev Only valid assessors can vote, and polls must be open for voting
  function castVote(bytes32 claimId, Vote vote, bytes32 ipfsHash) external whenNotPaused {

    require(vote == Vote.ACCEPT || vote == Vote.DENY, InvalidVote());

    // Validate assessor and get assessment data
    (uint256 assessorMemberId, Assessment storage assessment) = _validateAssessor(claimId, msg.sender);
    EnumerableSet.UintSet storage assessorGroup = _assessorGroups[assessment.assessorGroupId];
    require(assessorGroup.length() > 0, EmptyAssessorGroup());

    // Only allow voting if the poll is not yet decided (no votes, a draw or voting period hasn't ended)
    (uint256 acceptCount, uint256 denyCount) = _getVoteTally(assessment, assessorGroup);
    require(!_isAssessmentDecided(acceptCount, denyCount, assessment), ClaimAssessmentAlreadyClosed());

    // Update ballot
    assessment.ballot[assessorMemberId] = Ballot({
      vote: vote,
      ipfsHash: ipfsHash,
      timestamp: uint32(block.timestamp)
    });

    // Get the tally again after the vote
    (acceptCount, denyCount) = _getVoteTally(assessment, assessorGroup);

    // Check if we can close the poll early
    // NOTE: the check against assessorGroup being empty is done by _validateAssessor
    bool allVoted = acceptCount + denyCount == assessorGroup.length();
    bool notADraw = acceptCount != denyCount;
    bool canCloseEarly = allVoted && notADraw;

    if (canCloseEarly) {
      // All assessors have voted and it's not a draw, close the assessment early
      assessment.end = uint32(block.timestamp);
      emit AssessmentClosedEarly(claimId);
    } else {
      // Otherwise, check if we need to extend the voting period
      uint32 nextDay = uint32(block.timestamp + SILENT_ENDING_PERIOD);
      // If the poll ends in less than 24h from the latest vote, extend it to 24h
      if (assessment.end < nextDay) {
        assessment.end = nextDay;
        emit AssessmentExtended(claimId, nextDay);
      }
    }

    emit VoteCast(claimId, assessorMemberId, vote, ipfsHash);
  }

  /* ========== INTERNAL FUNCTIONS ========== */

  /// @dev Internal helper to determine if an assessment has been decided based on vote counts
  /// @param acceptCount Number of accept votes
  /// @param denyCount Number of deny votes
  /// @param assessment The assessment data for the claim
  /// @return true if the assessment is decided, false otherwise
  function _isAssessmentDecided(uint256 acceptCount, uint256 denyCount, Assessment storage assessment) internal view returns (bool) {
    // The assessment is considered still open if it's a draw, or no votes (0 == 0)
    if (acceptCount == denyCount) return false;

    // The assessment is considered decided if there is at least 1 vote and its not a draw and the voting period has ended
    return block.timestamp >= assessment.end;
  }

  /// @dev Internal function to count votes that accepts a pre-loaded assessor group and assessment
  /// @param assessment The pre-loaded assessment data
  /// @param assessorGroup The pre-loaded assessor group to iterate through
  /// @return acceptCount Number of assessors who voted to accept the claim
  /// @return denyCount Number of assessors who voted to deny the claim
  function _getVoteTally(
    Assessment storage assessment,
    EnumerableSet.UintSet storage assessorGroup
  ) internal view returns (uint256 acceptCount, uint256 denyCount) {

    acceptCount = 0;
    denyCount = 0;

    uint256 length = assessorGroup.length();

    for (uint i = 0; i < length;) {
        uint256 assessorMemberId = assessorGroup.at(i);
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
  function _validateAssessor(bytes32 claimId, address assessor) internal view returns (uint256 assessorMemberId, Assessment storage assessment) {

    // TODO: implement memberRoles.getMemberId - can be memberId be 0?
    assessorMemberId = _memberRoles().getMemberId(assessor);
    assessment = _assessments[claimId];

    require(assessment.start != 0, InvalidClaimId());
    require(_assessorGroups[assessment.assessorGroupId].contains(assessorMemberId), InvalidAssessor());

    return (assessorMemberId, assessment);
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
// castVotes
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